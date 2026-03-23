pub mod ai;
pub mod transcription;

use crate::cut_list::CutList;
use crate::error::Result;
use crate::ffmpeg::{validate_path_is_within_dir, FFmpegExecutor};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn greet(name: &str) -> Result<String> {
    tracing::info!("Greeting user: {}", name);
    Ok(format!("Hello, {}! You've been greeted from Rust!", name))
}

#[tauri::command]
pub async fn save_video(
    app: AppHandle,
    filename: String,
    data: Vec<u8>,
) -> Result<String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::VerbalError::MediaProcessing(e.to_string()))?;

    std::fs::create_dir_all(&app_dir)?;

    let file_path = app_dir.join(&filename);
    let canonical = dunce::canonicalize(&file_path)
        .unwrap_or_else(|_| file_path.clone());

    if !canonical.starts_with(&app_dir) {
        return Err(crate::error::VerbalError::MediaProcessing(
            "Path traversal detected".to_string(),
        ));
    }

    std::fs::write(&canonical, data)?;

    tracing::info!("Video saved to: {:?}", canonical);
    Ok(canonical.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_video_directory(app: AppHandle) -> Result<String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::VerbalError::MediaProcessing(e.to_string()))?;

    std::fs::create_dir_all(&app_dir)?;

    Ok(app_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn apply_cuts(
    app: AppHandle,
    input_filename: String,
    output_filename: String,
    cut_list_json: String,
) -> Result<crate::ffmpeg::FFmpegResult> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::VerbalError::MediaProcessing(e.to_string()))?;

    std::fs::create_dir_all(&app_dir)?;

    let input_path = app_dir.join(&input_filename);
    let output_path = app_dir.join(&output_filename);

    validate_path_is_within_dir(&output_path, &app_dir)?;

    let cut_list = CutList::parse_json(&cut_list_json)?;

    let executor = FFmpegExecutor::default();
    
    if !executor.check_available()? {
        return Err(crate::error::VerbalError::Ffmpeg(
            "FFmpeg is not installed or not available in PATH".to_string(),
        ));
    }

    executor.apply_cuts(&cut_list, &input_path, &output_path)
}

#[allow(dead_code)]
pub fn validate_filename(filename: &str) -> Result<String> {
    if filename.is_empty() {
        return Err(crate::error::VerbalError::MediaProcessing(
            "Filename cannot be empty".to_string(),
        ));
    }

    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err(crate::error::VerbalError::MediaProcessing(
            "Invalid characters in filename".to_string(),
        ));
    }

    Ok(filename.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet_returns_greeting() {
        let result = greet("World").unwrap();
        assert!(result.contains("World"));
    }

    #[test]
    fn test_validate_filename_empty() {
        let result = validate_filename("");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_filename_path_traversal() {
        let result = validate_filename("../secret");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_filename_slash() {
        let result = validate_filename("dir/file.webm");
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_filename_valid() {
        let result = validate_filename("recording.webm");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "recording.webm");
    }

    #[test]
    fn test_validate_filename_with_timestamp() {
        let result = validate_filename("recording_2024-01-15_10-30-00.webm");
        assert!(result.is_ok());
    }
}
