mod ai;
mod audio;
mod commands;
mod cut_list;
mod error;
mod ffmpeg;
mod transcription;

pub use ai::{
    credentials::CredentialManager, AiError, AiProvider, AiResult, Provider,
    TextGenerationRequest, TextGenerationResponse, TranscriptionRequest, TranscriptionResponse,
    WordTimestamp,
};
pub use commands::ai::{AiProviderHolder, AiProviderState};
pub use commands::transcription::OrchestratorState;
pub use cut_list::{CutList, TimeSegment};
pub use error::{Result, VerbalError};
pub use ffmpeg::{FFmpegExecutor, FFmpegResult};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tracing::info!("Starting Verbal application");

    let ai_state = commands::ai::init_ai_state();

    let temp_base = std::env::temp_dir().join("verbal");
    let orchestrator_state = commands::transcription::init_orchestrator(temp_base)
        .expect("Failed to initialize transcription orchestrator");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(crabcamera::init())
        .manage(ai_state)
        .manage(orchestrator_state)
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::save_video,
            commands::get_video_directory,
            commands::apply_cuts,
            commands::ai::configure_provider,
            commands::ai::set_active_provider,
            commands::ai::transcribe,
            commands::ai::generate_text,
            commands::ai::get_configured_providers,
            commands::ai::clear_provider_credentials,
            commands::transcription::start_transcription,
            commands::transcription::get_transcription_status,
            commands::transcription::cancel_transcription
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_types_available() {
        let _: Result<()> = Err(VerbalError::Ffmpeg("test".to_string()));
    }
}
