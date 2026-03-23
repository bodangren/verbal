pub mod credentials;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AiError {
    #[error("API key not configured for provider: {0}")]
    MissingApiKey(String),

    #[error("HTTP request failed: {0}")]
    HttpError(String),

    #[error("API error: {0}")]
    ApiError(String),

    #[error("Credential storage error: {0}")]
    CredentialError(String),

    #[error("Provider not available: {0}")]
    ProviderNotAvailable(String),

    #[error("Invalid response from provider: {0}")]
    InvalidResponse(String),
}

impl From<AiError> for tauri::ipc::InvokeError {
    fn from(err: AiError) -> Self {
        tauri::ipc::InvokeError::from(err.to_string())
    }
}

pub type AiResult<T> = std::result::Result<T, AiError>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Provider {
    OpenAI,
    Google,
}

impl std::fmt::Display for Provider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Provider::OpenAI => write!(f, "openai"),
            Provider::Google => write!(f, "google"),
        }
    }
}

impl std::str::FromStr for Provider {
    type Err = AiError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "openai" => Ok(Provider::OpenAI),
            "google" => Ok(Provider::Google),
            _ => Err(AiError::ProviderNotAvailable(s.to_string())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionRequest {
    pub audio_data: Vec<u8>,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResponse {
    pub text: String,
    pub words: Vec<WordTimestamp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordTimestamp {
    pub word: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextGenerationRequest {
    pub prompt: String,
    pub system_prompt: Option<String>,
    pub max_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextGenerationResponse {
    pub text: String,
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    fn provider_name(&self) -> &str;

    async fn transcribe(&self, request: TranscriptionRequest) -> AiResult<TranscriptionResponse>;

    async fn generate_text(&self, request: TextGenerationRequest) -> AiResult<TextGenerationResponse>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_error_display_missing_api_key() {
        let err = AiError::MissingApiKey("openai".to_string());
        assert!(err.to_string().contains("API key not configured"));
    }

    #[test]
    fn test_ai_error_display_http_error() {
        let err = AiError::HttpError("connection timeout".to_string());
        assert!(err.to_string().contains("HTTP request failed"));
    }

    #[test]
    fn test_ai_error_to_invoke_error() {
        let err = AiError::ApiError("rate limit".to_string());
        let _invoke_err: tauri::ipc::InvokeError = err.into();
    }

    #[test]
    fn test_provider_display() {
        assert_eq!(Provider::OpenAI.to_string(), "openai");
        assert_eq!(Provider::Google.to_string(), "google");
    }

    #[test]
    fn test_provider_from_str_valid() {
        let openai: Provider = "openai".parse().unwrap();
        assert_eq!(openai, Provider::OpenAI);

        let google: Provider = "google".parse().unwrap();
        assert_eq!(google, Provider::Google);
    }

    #[test]
    fn test_provider_from_str_case_insensitive() {
        let openai: Provider = "OpenAI".parse().unwrap();
        assert_eq!(openai, Provider::OpenAI);
    }

    #[test]
    fn test_provider_from_str_invalid() {
        let result: Result<Provider, _> = "unknown".parse();
        assert!(result.is_err());
        if let Err(AiError::ProviderNotAvailable(name)) = result {
            assert_eq!(name, "unknown");
        } else {
            panic!("Expected ProviderNotAvailable error");
        }
    }

    #[test]
    fn test_provider_serialization() {
        let provider = Provider::OpenAI;
        let json = serde_json::to_string(&provider).unwrap();
        assert!(json.contains("OpenAI"));
    }

    #[test]
    fn test_provider_deserialization() {
        let json = r#""Google""#;
        let provider: Provider = serde_json::from_str(json).unwrap();
        assert_eq!(provider, Provider::Google);
    }

    #[test]
    fn test_transcription_request_serialization() {
        let request = TranscriptionRequest {
            audio_data: vec![1, 2, 3],
            language: Some("en".to_string()),
        };
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("audio_data"));
        assert!(json.contains("language"));
    }

    #[test]
    fn test_word_timestamp() {
        let word_ts = WordTimestamp {
            word: "hello".to_string(),
            start: 0.0,
            end: 0.5,
        };
        assert_eq!(word_ts.word, "hello");
        assert!((word_ts.start - 0.0).abs() < f64::EPSILON);
        assert!((word_ts.end - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_text_generation_request() {
        let request = TextGenerationRequest {
            prompt: "Test prompt".to_string(),
            system_prompt: Some("You are helpful".to_string()),
            max_tokens: Some(100),
        };
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("prompt"));
        assert!(json.contains("system_prompt"));
        assert!(json.contains("max_tokens"));
    }
}
