use crate::ai::{AiProvider, TranscriptionRequest};
use crate::audio::TempFileManager;
use crate::ffmpeg::{AudioExtractor, ExtractionConfig};
use crate::transcription::{FillerDetector, JobResult, JobStatus, JobTracker, TranscriptionJob};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

pub struct TranscriptionOrchestrator {
    tracker: Arc<RwLock<JobTracker>>,
    temp_manager: TempFileManager,
    extractor: AudioExtractor,
}

impl TranscriptionOrchestrator {
    pub fn new(temp_dir: PathBuf) -> crate::error::Result<Self> {
        Ok(Self {
            tracker: Arc::new(RwLock::new(JobTracker::new())),
            temp_manager: TempFileManager::new(temp_dir)?,
            extractor: AudioExtractor::default(),
        })
    }

    pub fn tracker(&self) -> Arc<RwLock<JobTracker>> {
        self.tracker.clone()
    }

    pub async fn create_job(&self, media_path: String) -> crate::error::Result<String> {
        let job_id = Uuid::new_v4().to_string();
        let job = TranscriptionJob::new(job_id.clone(), media_path);

        let mut tracker = self.tracker.write().await;
        tracker.add(job);

        Ok(job_id)
    }

    pub async fn get_job(&self, job_id: &str) -> Option<TranscriptionJob> {
        let tracker = self.tracker.read().await;
        tracker.get(job_id).cloned()
    }

    pub async fn cancel_job(&self, job_id: &str) -> bool {
        let mut tracker = self.tracker.write().await;
        tracker.cancel(job_id)
    }

    pub async fn execute(
        &self,
        job_id: &str,
        provider: &dyn AiProvider,
    ) -> crate::error::Result<JobResult> {
        let media_path = {
            let tracker = self.tracker.read().await;
            match tracker.get(job_id) {
                Some(job) if job.status == JobStatus::Pending => job.media_path.clone(),
                Some(job) => {
                    return Err(crate::error::VerbalError::MediaProcessing(format!(
                        "Job {} is not in pending state: {:?}",
                        job_id, job.status
                    )));
                }
                None => {
                    return Err(crate::error::VerbalError::MediaProcessing(format!(
                        "Job {} not found",
                        job_id
                    )));
                }
            }
        };

        {
            let mut tracker = self.tracker.write().await;
            tracker.start_processing(job_id);
        }

        let result = self.execute_internal(job_id, &media_path, provider).await;

        match result {
            Ok(job_result) => {
                let mut tracker = self.tracker.write().await;
                tracker.mark_completed(job_id);
                Ok(job_result)
            }
            Err(e) => {
                let mut tracker = self.tracker.write().await;
                tracker.mark_failed(job_id, e.to_string());
                Err(e)
            }
        }
    }

    async fn execute_internal(
        &self,
        job_id: &str,
        media_path: &str,
        provider: &dyn AiProvider,
    ) -> crate::error::Result<JobResult> {
        let output_path = self
            .temp_manager
            .create_temp_audio_path("wav")?;

        let extraction_config = ExtractionConfig::for_transcription();

        let extraction_result = self
            .extractor
            .extract_audio_async(PathBuf::from(media_path).as_path(), &output_path, &extraction_config)
            .await?;

        {
            let mut tracker = self.tracker.write().await;
            if let Some(job) = tracker.get_mut(job_id) {
                job.set_progress(0.3);
            }
        }

        let audio_data = tokio::fs::read(&extraction_result.audio_path)
            .await
            .map_err(|e| crate::error::VerbalError::MediaProcessing(format!("Failed to read audio: {}", e)))?;

        {
            let mut tracker = self.tracker.write().await;
            if let Some(job) = tracker.get_mut(job_id) {
                job.set_progress(0.5);
            }
        }

        let transcription_request = TranscriptionRequest {
            audio_data,
            language: None,
        };

        let response = provider
            .transcribe(transcription_request)
            .await
            .map_err(|e| crate::error::VerbalError::MediaProcessing(format!("Transcription failed: {}", e)))?;

        {
            let mut tracker = self.tracker.write().await;
            if let Some(job) = tracker.get_mut(job_id) {
                job.set_progress(0.7);
            }
        }

        let filler_request = FillerDetector::build_prompt(&response.text);
        let filler_words = match provider.generate_text(filler_request).await {
            Ok(filler_response) => FillerDetector::parse_response(&filler_response.text, &response.words),
            Err(e) => {
                tracing::warn!("Filler detection failed, continuing without fillers: {}", e);
                vec![]
            }
        };

        {
            let mut tracker = self.tracker.write().await;
            if let Some(job) = tracker.get_mut(job_id) {
                job.set_progress(0.9);
            }
        }

        crate::audio::TempFileManager::cleanup_file(&extraction_result.audio_path);

        Ok(JobResult {
            job_id: job_id.to_string(),
            text: response.text,
            words: response.words,
            filler_words,
            duration_seconds: extraction_result.duration_seconds,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::{AiResult, TranscriptionResponse};
    use async_trait::async_trait;
    use tempfile::tempdir;

    struct MockProvider {
        should_fail: bool,
    }

    impl MockProvider {
        fn new(should_fail: bool) -> Self {
            Self { should_fail }
        }
    }

    #[async_trait]
    impl AiProvider for MockProvider {
        fn provider_name(&self) -> &str {
            "mock"
        }

        async fn transcribe(
            &self,
            _request: TranscriptionRequest,
        ) -> AiResult<TranscriptionResponse> {
            if self.should_fail {
                Err(crate::ai::AiError::ApiError("Mock error".to_string()))
            } else {
                Ok(TranscriptionResponse {
                    text: "Hello world".to_string(),
                    words: vec![],
                })
            }
        }

        async fn generate_text(
            &self,
            _request: crate::ai::TextGenerationRequest,
        ) -> AiResult<crate::ai::TextGenerationResponse> {
            unimplemented!()
        }
    }

    #[tokio::test]
    async fn test_create_job() {
        let dir = tempdir().unwrap();
        let orchestrator = TranscriptionOrchestrator::new(dir.path().to_path_buf()).unwrap();

        let job_id = orchestrator.create_job("/path/to/video.mp4".to_string()).await.unwrap();
        assert!(!job_id.is_empty());

        let job = orchestrator.get_job(&job_id).await.unwrap();
        assert_eq!(job.status, JobStatus::Pending);
        assert_eq!(job.media_path, "/path/to/video.mp4");
    }

    #[tokio::test]
    async fn test_cancel_job() {
        let dir = tempdir().unwrap();
        let orchestrator = TranscriptionOrchestrator::new(dir.path().to_path_buf()).unwrap();

        let job_id = orchestrator.create_job("/path/to/video.mp4".to_string()).await.unwrap();
        let cancelled = orchestrator.cancel_job(&job_id).await;
        assert!(cancelled);

        let job = orchestrator.get_job(&job_id).await.unwrap();
        assert_eq!(job.status, JobStatus::Cancelled);
    }

    #[tokio::test]
    async fn test_cancel_nonexistent_job() {
        let dir = tempdir().unwrap();
        let orchestrator = TranscriptionOrchestrator::new(dir.path().to_path_buf()).unwrap();

        let cancelled = orchestrator.cancel_job("nonexistent").await;
        assert!(!cancelled);
    }

    #[tokio::test]
    async fn test_get_nonexistent_job() {
        let dir = tempdir().unwrap();
        let orchestrator = TranscriptionOrchestrator::new(dir.path().to_path_buf()).unwrap();

        let job = orchestrator.get_job("nonexistent").await;
        assert!(job.is_none());
    }

    #[tokio::test]
    async fn test_execute_wrong_status() {
        let dir = tempdir().unwrap();
        let orchestrator = TranscriptionOrchestrator::new(dir.path().to_path_buf()).unwrap();

        let job_id = orchestrator.create_job("/path/to/video.mp4".to_string()).await.unwrap();
        
        {
            let mut tracker = orchestrator.tracker.write().await;
            if let Some(job) = tracker.get_mut(&job_id) {
                job.set_status(JobStatus::Completed);
            }
        }

        let provider = MockProvider::new(false);
        let result = orchestrator.execute(&job_id, &provider).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("is not in pending state"));
    }

    #[tokio::test]
    async fn test_execute_nonexistent_job() {
        let dir = tempdir().unwrap();
        let orchestrator = TranscriptionOrchestrator::new(dir.path().to_path_buf()).unwrap();

        let provider = MockProvider::new(false);
        let result = orchestrator.execute("nonexistent", &provider).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }
}
