use crate::commands::ai::AiProviderState;
use crate::transcription::{TranscriptionJob, TranscriptionOrchestrator};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub type OrchestratorState = Arc<RwLock<TranscriptionOrchestrator>>;

pub fn init_orchestrator(app_data_dir: PathBuf) -> Option<OrchestratorState> {
    let temp_dir = app_data_dir.join("transcription_temp");
    match TranscriptionOrchestrator::new(temp_dir) {
        Ok(orchestrator) => Some(Arc::new(RwLock::new(orchestrator))),
        Err(e) => {
            tracing::error!("Failed to initialize transcription orchestrator: {}", e);
            None
        }
    }
}

#[tauri::command]
pub async fn start_transcription(
    ai_state: tauri::State<'_, AiProviderState>,
    orchestrator_state: tauri::State<'_, OrchestratorState>,
    media_path: String,
) -> crate::error::Result<String> {
    let orchestrator = orchestrator_state.inner().clone();

    let job_id = orchestrator.read().await.create_job(media_path.clone()).await?;

    let ai_guard = ai_state.read().await;
    let holder = ai_guard
        .as_ref()
        .ok_or_else(|| crate::error::VerbalError::MediaProcessing("No AI provider configured".to_string()))?;
    
    let provider = holder.get_provider()
        .map_err(|e| crate::error::VerbalError::MediaProcessing(e.to_string()))?;

    let result = orchestrator.read().await.execute(&job_id, provider).await;
    
    match result {
        Ok(res) => {
            tracing::info!("Transcription completed for job {}: {} words", job_id, res.words.len());
        }
        Err(e) => {
            tracing::error!("Transcription failed for job {}: {}", job_id, e);
        }
    }

    drop(ai_guard);
    Ok(job_id)
}

#[tauri::command]
pub async fn get_transcription_status(
    orchestrator_state: tauri::State<'_, OrchestratorState>,
    job_id: String,
) -> crate::error::Result<TranscriptionJob> {
    let orchestrator = orchestrator_state.inner().clone();
    let guard = orchestrator.read().await;
    let job = guard.get_job(&job_id).await;
    
    job.ok_or_else(|| crate::error::VerbalError::MediaProcessing(format!("Job {} not found", job_id)))
}

#[tauri::command]
pub async fn cancel_transcription(
    orchestrator_state: tauri::State<'_, OrchestratorState>,
    job_id: String,
) -> crate::error::Result<bool> {
    let orchestrator = orchestrator_state.inner().clone();
    let result = orchestrator.write().await.cancel_job(&job_id).await;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_orchestrator() {
        let temp_dir = tempfile::tempdir().unwrap();
        let state = init_orchestrator(temp_dir.path().to_path_buf());
        assert!(state.is_some());
    }
}
