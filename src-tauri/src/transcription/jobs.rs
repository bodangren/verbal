use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

impl Default for JobStatus {
    fn default() -> Self {
        Self::Pending
    }
}

impl std::fmt::Display for JobStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JobStatus::Pending => write!(f, "pending"),
            JobStatus::Processing => write!(f, "processing"),
            JobStatus::Completed => write!(f, "completed"),
            JobStatus::Failed => write!(f, "failed"),
            JobStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionJob {
    pub id: String,
    pub media_path: String,
    pub status: JobStatus,
    pub progress: f32,
    pub error_message: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

impl TranscriptionJob {
    pub fn new(id: String, media_path: String) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            id,
            media_path,
            status: JobStatus::Pending,
            progress: 0.0,
            error_message: None,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn set_status(&mut self, status: JobStatus) {
        self.status = status;
        self.touch();
    }

    pub fn set_progress(&mut self, progress: f32) {
        self.progress = progress.clamp(0.0, 1.0);
        self.touch();
    }

    pub fn set_error(&mut self, message: String) {
        self.status = JobStatus::Failed;
        self.error_message = Some(message);
        self.touch();
    }

    fn touch(&mut self) {
        self.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled
        )
    }

    pub fn can_cancel(&self) -> bool {
        matches!(self.status, JobStatus::Pending | JobStatus::Processing)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobResult {
    pub job_id: String,
    pub text: String,
    pub words: Vec<crate::ai::WordTimestamp>,
    pub filler_words: Vec<crate::transcription::FillerSegment>,
    pub duration_seconds: f64,
}

pub struct JobTracker {
    jobs: std::collections::HashMap<String, TranscriptionJob>,
    start_times: std::collections::HashMap<String, Instant>,
}

impl JobTracker {
    pub fn new() -> Self {
        Self {
            jobs: std::collections::HashMap::new(),
            start_times: std::collections::HashMap::new(),
        }
    }

    pub fn add(&mut self, job: TranscriptionJob) {
        self.jobs.insert(job.id.clone(), job);
    }

    pub fn get(&self, id: &str) -> Option<&TranscriptionJob> {
        self.jobs.get(id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut TranscriptionJob> {
        self.jobs.get_mut(id)
    }

    pub fn remove(&mut self, id: &str) -> Option<TranscriptionJob> {
        self.start_times.remove(id);
        self.jobs.remove(id)
    }

    pub fn start_processing(&mut self, id: &str) -> bool {
        if let Some(job) = self.jobs.get_mut(id) {
            if job.status == JobStatus::Pending {
                job.set_status(JobStatus::Processing);
                self.start_times.insert(id.to_string(), Instant::now());
                return true;
            }
        }
        false
    }

    pub fn mark_completed(&mut self, id: &str) -> bool {
        if let Some(job) = self.jobs.get_mut(id) {
            if job.status == JobStatus::Processing {
                job.set_status(JobStatus::Completed);
                job.set_progress(1.0);
                self.start_times.remove(id);
                return true;
            }
        }
        false
    }

    pub fn mark_failed(&mut self, id: &str, error: String) -> bool {
        if let Some(job) = self.jobs.get_mut(id) {
            job.set_error(error);
            self.start_times.remove(id);
            return true;
        }
        false
    }

    pub fn cancel(&mut self, id: &str) -> bool {
        if let Some(job) = self.jobs.get_mut(id) {
            if job.can_cancel() {
                job.set_status(JobStatus::Cancelled);
                self.start_times.remove(id);
                return true;
            }
        }
        false
    }

    pub fn elapsed(&self, id: &str) -> Option<Duration> {
        self.start_times.get(id).map(|t| t.elapsed())
    }

    pub fn list(&self) -> Vec<&TranscriptionJob> {
        self.jobs.values().collect()
    }
}

impl Default for JobTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_job_status_default() {
        let status: JobStatus = Default::default();
        assert_eq!(status, JobStatus::Pending);
    }

    #[test]
    fn test_job_status_display() {
        assert_eq!(JobStatus::Pending.to_string(), "pending");
        assert_eq!(JobStatus::Processing.to_string(), "processing");
        assert_eq!(JobStatus::Completed.to_string(), "completed");
        assert_eq!(JobStatus::Failed.to_string(), "failed");
        assert_eq!(JobStatus::Cancelled.to_string(), "cancelled");
    }

    #[test]
    fn test_job_status_serialization() {
        let status = JobStatus::Processing;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"processing\"");

        let parsed: JobStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, JobStatus::Processing);
    }

    #[test]
    fn test_transcription_job_new() {
        let job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        assert_eq!(job.id, "job-1");
        assert_eq!(job.media_path, "/path/to/video.mp4");
        assert_eq!(job.status, JobStatus::Pending);
        assert_eq!(job.progress, 0.0);
        assert!(job.error_message.is_none());
    }

    #[test]
    fn test_transcription_job_set_status() {
        let mut job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        job.set_status(JobStatus::Processing);
        assert_eq!(job.status, JobStatus::Processing);
    }

    #[test]
    fn test_transcription_job_set_progress() {
        let mut job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        job.set_progress(0.5);
        assert!((job.progress - 0.5).abs() < f32::EPSILON);
    }

    #[test]
    fn test_transcription_job_progress_clamped() {
        let mut job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        job.set_progress(1.5);
        assert!((job.progress - 1.0).abs() < f32::EPSILON);

        job.set_progress(-0.5);
        assert!((job.progress - 0.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_transcription_job_set_error() {
        let mut job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        job.set_error("Network error".to_string());
        assert_eq!(job.status, JobStatus::Failed);
        assert_eq!(job.error_message, Some("Network error".to_string()));
    }

    #[test]
    fn test_transcription_job_is_terminal() {
        let mut job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());

        job.status = JobStatus::Pending;
        assert!(!job.is_terminal());

        job.status = JobStatus::Processing;
        assert!(!job.is_terminal());

        job.status = JobStatus::Completed;
        assert!(job.is_terminal());

        job.status = JobStatus::Failed;
        assert!(job.is_terminal());

        job.status = JobStatus::Cancelled;
        assert!(job.is_terminal());
    }

    #[test]
    fn test_transcription_job_can_cancel() {
        let mut job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());

        job.status = JobStatus::Pending;
        assert!(job.can_cancel());

        job.status = JobStatus::Processing;
        assert!(job.can_cancel());

        job.status = JobStatus::Completed;
        assert!(!job.can_cancel());

        job.status = JobStatus::Failed;
        assert!(!job.can_cancel());
    }

    #[test]
    fn test_job_tracker_add_and_get() {
        let mut tracker = JobTracker::new();
        let job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        tracker.add(job);

        let retrieved = tracker.get("job-1");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().id, "job-1");
    }

    #[test]
    fn test_job_tracker_get_nonexistent() {
        let tracker = JobTracker::new();
        assert!(tracker.get("nonexistent").is_none());
    }

    #[test]
    fn test_job_tracker_remove() {
        let mut tracker = JobTracker::new();
        let job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        tracker.add(job);

        let removed = tracker.remove("job-1");
        assert!(removed.is_some());
        assert!(tracker.get("job-1").is_none());
    }

    #[test]
    fn test_job_tracker_start_processing() {
        let mut tracker = JobTracker::new();
        let job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        tracker.add(job);

        let result = tracker.start_processing("job-1");
        assert!(result);
        assert_eq!(tracker.get("job-1").unwrap().status, JobStatus::Processing);
    }

    #[test]
    fn test_job_tracker_start_processing_wrong_status() {
        let mut tracker = JobTracker::new();
        let mut job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        job.status = JobStatus::Completed;
        tracker.add(job);

        let result = tracker.start_processing("job-1");
        assert!(!result);
    }

    #[test]
    fn test_job_tracker_mark_completed() {
        let mut tracker = JobTracker::new();
        let job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        tracker.add(job);
        tracker.start_processing("job-1");

        let result = tracker.mark_completed("job-1");
        assert!(result);
        let job = tracker.get("job-1").unwrap();
        assert_eq!(job.status, JobStatus::Completed);
        assert!((job.progress - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn test_job_tracker_mark_failed() {
        let mut tracker = JobTracker::new();
        let job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        tracker.add(job);

        let result = tracker.mark_failed("job-1", "API error".to_string());
        assert!(result);
        let job = tracker.get("job-1").unwrap();
        assert_eq!(job.status, JobStatus::Failed);
        assert_eq!(job.error_message, Some("API error".to_string()));
    }

    #[test]
    fn test_job_tracker_cancel() {
        let mut tracker = JobTracker::new();
        let job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        tracker.add(job);

        let result = tracker.cancel("job-1");
        assert!(result);
        assert_eq!(tracker.get("job-1").unwrap().status, JobStatus::Cancelled);
    }

    #[test]
    fn test_job_tracker_cancel_non_cancellable() {
        let mut tracker = JobTracker::new();
        let mut job = TranscriptionJob::new("job-1".to_string(), "/path/to/video.mp4".to_string());
        job.status = JobStatus::Completed;
        tracker.add(job);

        let result = tracker.cancel("job-1");
        assert!(!result);
    }

    #[test]
    fn test_job_tracker_list() {
        let mut tracker = JobTracker::new();
        tracker.add(TranscriptionJob::new(
            "job-1".to_string(),
            "/a.mp4".to_string(),
        ));
        tracker.add(TranscriptionJob::new(
            "job-2".to_string(),
            "/b.mp4".to_string(),
        ));

        let jobs = tracker.list();
        assert_eq!(jobs.len(), 2);
    }

    #[test]
    fn test_job_result_serialization() {
        let result = JobResult {
            job_id: "job-1".to_string(),
            text: "Hello world".to_string(),
            words: vec![crate::ai::WordTimestamp {
                word: "Hello".to_string(),
                start: 0.0,
                end: 0.5,
            }],
            filler_words: vec![],
            duration_seconds: 10.5,
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("job-1"));
        assert!(json.contains("Hello world"));
        assert!(json.contains("10.5"));
    }
}
