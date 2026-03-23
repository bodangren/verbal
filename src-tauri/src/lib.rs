mod ai;
mod commands;
mod cut_list;
mod error;
mod ffmpeg;

pub use ai::{
    credentials::CredentialManager, AiError, AiProvider, AiResult, Provider,
    TextGenerationRequest, TextGenerationResponse, TranscriptionRequest, TranscriptionResponse,
    WordTimestamp,
};
pub use commands::ai::{AiProviderHolder, AiProviderState};
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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ai_state)
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
            commands::ai::clear_provider_credentials
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
