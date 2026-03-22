use thiserror::Error;

#[derive(Error, Debug)]
pub enum VerbalError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON serialization error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("FFmpeg error: {0}")]
    Ffmpeg(String),

    #[error("Invalid cut list: {0}")]
    InvalidCutList(String),

    #[error("Media processing error: {0}")]
    MediaProcessing(String),
}

impl From<VerbalError> for tauri::ipc::InvokeError {
    fn from(err: VerbalError) -> Self {
        tauri::ipc::InvokeError::from(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, VerbalError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = VerbalError::Ffmpeg("ffmpeg not found".to_string());
        assert!(err.to_string().contains("ffmpeg"));
    }

    #[test]
    fn test_invalid_cut_list_error() {
        let err = VerbalError::InvalidCutList("empty segments".to_string());
        assert!(err.to_string().contains("Invalid cut list"));
    }

    #[test]
    fn test_error_to_invoke_error() {
        let err = VerbalError::Ffmpeg("test".to_string());
        let _invoke_err: tauri::ipc::InvokeError = err.into();
    }
}
