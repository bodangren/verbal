#![allow(dead_code)]

use crate::ai::{
    AiError, AiProvider, AiResult, TextGenerationRequest, TextGenerationResponse,
    TranscriptionRequest, TranscriptionResponse, WordTimestamp,
};
use async_trait::async_trait;
use reqwest::multipart;
use serde::{Deserialize, Serialize};

const OPENAI_API_BASE: &str = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_RETRIES: u32 = 3;
const INITIAL_RETRY_DELAY_MS: u64 = 100;

pub struct OpenAiProvider {
    api_key: String,
    client: reqwest::Client,
    base_url: String,
    timeout_secs: u64,
    max_retries: u32,
}

impl OpenAiProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::new(),
            base_url: OPENAI_API_BASE.to_string(),
            timeout_secs: DEFAULT_TIMEOUT_SECS,
            max_retries: MAX_RETRIES,
        }
    }

    pub fn with_base_url(api_key: String, base_url: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::new(),
            base_url,
            timeout_secs: DEFAULT_TIMEOUT_SECS,
            max_retries: MAX_RETRIES,
        }
    }

    pub fn with_client(api_key: String, client: reqwest::Client, base_url: String) -> Self {
        Self {
            api_key,
            client,
            base_url,
            timeout_secs: DEFAULT_TIMEOUT_SECS,
            max_retries: MAX_RETRIES,
        }
    }

    pub fn with_timeout(mut self, timeout_secs: u64) -> Self {
        self.timeout_secs = timeout_secs;
        self
    }

    pub fn with_max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    async fn sleep_ms(ms: u64) {
        tokio::time::sleep(tokio::time::Duration::from_millis(ms)).await;
    }

    fn calculate_retry_delay(attempt: u32) -> u64 {
        INITIAL_RETRY_DELAY_MS * 2u64.pow(attempt)
    }

    async fn transcribe_with_client(
        &self,
        request: TranscriptionRequest,
    ) -> AiResult<TranscriptionResponse> {
        let mut last_error: Option<AiError> = None;

        for attempt in 0..=self.max_retries {
            if attempt > 0 {
                let delay = Self::calculate_retry_delay(attempt - 1);
                Self::sleep_ms(delay).await;
            }

            match self.transcribe_once(&request).await {
                Ok(response) => return Ok(response),
                Err(e) => {
                    if Self::should_retry(&e) && attempt < self.max_retries {
                        last_error = Some(e);
                        continue;
                    }
                    return Err(e);
                }
            }
        }

        Err(last_error.unwrap_or(AiError::HttpError("Max retries exceeded".to_string())))
    }

    fn should_retry(error: &AiError) -> bool {
        matches!(error, AiError::HttpError(_) | AiError::Timeout)
    }

    async fn transcribe_once(
        &self,
        request: &TranscriptionRequest,
    ) -> AiResult<TranscriptionResponse> {
        let mut form = multipart::Form::new()
            .text("model", "whisper-1")
            .text("response_format", "verbose_json")
            .part(
                "file",
                multipart::Part::bytes(request.audio_data.clone())
                    .file_name("audio.mp3")
                    .mime_str("audio/mpeg")
                    .map_err(|e| AiError::HttpError(e.to_string()))?,
            );

        if let Some(ref lang) = request.language {
            form = form.text("language", lang.clone());
        }

        let response = self
            .client
            .post(format!("{}/audio/transcriptions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .timeout(std::time::Duration::from_secs(self.timeout_secs))
            .multipart(form)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    AiError::Timeout
                } else {
                    AiError::HttpError(e.to_string())
                }
            })?;

        if !response.status().is_success() {
            return Err(Self::map_error_response(response).await);
        }

        let whisper_response: WhisperTranscriptionResponse = response
            .json()
            .await
            .map_err(|e| AiError::InvalidResponse(e.to_string()))?;

        Ok(TranscriptionResponse {
            text: whisper_response.text,
            words: whisper_response
                .words
                .unwrap_or_default()
                .into_iter()
                .map(|w| WordTimestamp {
                    word: w.word,
                    start: w.start,
                    end: w.end,
                })
                .collect(),
        })
    }

    async fn map_error_response(response: reqwest::Response) -> AiError {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());

        match status {
            s if s == reqwest::StatusCode::UNAUTHORIZED => {
                AiError::AuthenticationFailed(error_text)
            }
            s if s == reqwest::StatusCode::TOO_MANY_REQUESTS => {
                AiError::RateLimited(60)
            }
            s if s.is_server_error() => AiError::HttpError(error_text),
            _ => AiError::ApiError(error_text),
        }
    }

    async fn generate_text_with_client(
        &self,
        request: TextGenerationRequest,
    ) -> AiResult<TextGenerationResponse> {
        let mut last_error: Option<AiError> = None;

        for attempt in 0..=self.max_retries {
            if attempt > 0 {
                let delay = Self::calculate_retry_delay(attempt - 1);
                Self::sleep_ms(delay).await;
            }

            match self.generate_text_once(&request).await {
                Ok(response) => return Ok(response),
                Err(e) => {
                    if Self::should_retry(&e) && attempt < self.max_retries {
                        last_error = Some(e);
                        continue;
                    }
                    return Err(e);
                }
            }
        }

        Err(last_error.unwrap_or(AiError::HttpError("Max retries exceeded".to_string())))
    }

    async fn generate_text_once(
        &self,
        request: &TextGenerationRequest,
    ) -> AiResult<TextGenerationResponse> {
        let messages = if let Some(ref system) = request.system_prompt {
            vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: system.clone(),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: request.prompt.clone(),
                },
            ]
        } else {
            vec![ChatMessage {
                role: "user".to_string(),
                content: request.prompt.clone(),
            }]
        };

        let body = ChatCompletionRequest {
            model: "gpt-4o".to_string(),
            messages,
            max_tokens: request.max_tokens,
        };

        let response = self
            .client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .timeout(std::time::Duration::from_secs(self.timeout_secs))
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    AiError::Timeout
                } else {
                    AiError::HttpError(e.to_string())
                }
            })?;

        if !response.status().is_success() {
            return Err(Self::map_error_response(response).await);
        }

        let completion: ChatCompletionResponse = response
            .json()
            .await
            .map_err(|e| AiError::InvalidResponse(e.to_string()))?;

        let text = completion
            .choices
            .first()
            .map(|c| c.message.content.clone())
            .unwrap_or_default();

        Ok(TextGenerationResponse { text })
    }
}

#[async_trait]
impl AiProvider for OpenAiProvider {
    fn provider_name(&self) -> &str {
        "openai"
    }

    async fn transcribe(&self, request: TranscriptionRequest) -> AiResult<TranscriptionResponse> {
        self.transcribe_with_client(request).await
    }

    async fn generate_text(
        &self,
        request: TextGenerationRequest,
    ) -> AiResult<TextGenerationResponse> {
        self.generate_text_with_client(request).await
    }
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct WhisperTranscriptionResponse {
    text: String,
    words: Option<Vec<WhisperWord>>,
}

#[derive(Debug, Deserialize)]
struct WhisperWord {
    word: String,
    start: f64,
    end: f64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::{Matcher, Server};

    #[tokio::test]
    async fn test_transcribe_success() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/audio/transcriptions")
            .match_header("Authorization", "Bearer test-api-key")
            .match_header("Content-Type", Matcher::Regex("multipart/form-data".to_string()))
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(
                r#"{
                    "text": "Hello world",
                    "words": [
                        {"word": "Hello", "start": 0.0, "end": 0.5},
                        {"word": "world", "start": 0.5, "end": 1.0}
                    ]
                }"#,
            )
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "test-api-key".to_string(),
            client,
            server.url(),
        );

        let response = provider
            .transcribe(TranscriptionRequest {
                audio_data: vec![0u8; 100],
                language: Some("en".to_string()),
            })
            .await;

        mock.assert();
        assert!(response.is_ok());
        let transcription = response.unwrap();
        assert_eq!(transcription.text, "Hello world");
        assert_eq!(transcription.words.len(), 2);
        assert_eq!(transcription.words[0].word, "Hello");
    }

    #[tokio::test]
    async fn test_transcribe_api_error() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/audio/transcriptions")
            .with_status(400)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Bad request"}}"#)
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "invalid-key".to_string(),
            client,
            server.url(),
        )
        .with_max_retries(0);

        let response = provider
            .transcribe(TranscriptionRequest {
                audio_data: vec![0u8; 100],
                language: None,
            })
            .await;

        mock.assert();
        assert!(response.is_err());
        if let Err(AiError::ApiError(msg)) = response {
            assert!(msg.contains("Bad request"));
        } else {
            panic!("Expected ApiError");
        }
    }

    #[tokio::test]
    async fn test_transcribe_no_words() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/audio/transcriptions")
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"text": "Simple text"}"#)
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "test-key".to_string(),
            client,
            server.url(),
        );

        let response = provider
            .transcribe(TranscriptionRequest {
                audio_data: vec![0u8; 50],
                language: None,
            })
            .await;

        mock.assert();
        assert!(response.is_ok());
        let transcription = response.unwrap();
        assert_eq!(transcription.text, "Simple text");
        assert!(transcription.words.is_empty());
    }

    #[tokio::test]
    async fn test_generate_text_success() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/chat/completions")
            .match_header("Authorization", "Bearer test-api-key")
            .match_header("Content-Type", "application/json")
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(
                r#"{
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": "This is the response."
                            }
                        }
                    ]
                }"#,
            )
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "test-api-key".to_string(),
            client,
            server.url(),
        );

        let response = provider
            .generate_text(TextGenerationRequest {
                prompt: "Hello".to_string(),
                system_prompt: None,
                max_tokens: Some(100),
            })
            .await;

        mock.assert();
        assert!(response.is_ok());
        let gen = response.unwrap();
        assert_eq!(gen.text, "This is the response.");
    }

    #[tokio::test]
    async fn test_generate_text_with_system_prompt() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/chat/completions")
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(
                r#"{
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": "System response"
                            }
                        }
                    ]
                }"#,
            )
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "test-key".to_string(),
            client,
            server.url(),
        );

        let response = provider
            .generate_text(TextGenerationRequest {
                prompt: "Hi".to_string(),
                system_prompt: Some("You are helpful".to_string()),
                max_tokens: None,
            })
            .await;

        mock.assert();
        assert!(response.is_ok());
        assert_eq!(response.unwrap().text, "System response");
    }

    #[tokio::test]
    async fn test_generate_text_api_error() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/chat/completions")
            .with_status(400)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Bad request"}}"#)
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "test-key".to_string(),
            client,
            server.url(),
        )
        .with_max_retries(0);

        let response = provider
            .generate_text(TextGenerationRequest {
                prompt: "Test".to_string(),
                system_prompt: None,
                max_tokens: None,
            })
            .await;

        mock.assert();
        assert!(response.is_err());
        if let Err(AiError::ApiError(msg)) = response {
            assert!(msg.contains("Bad request"));
        } else {
            panic!("Expected ApiError");
        }
    }

    #[tokio::test]
    async fn test_generate_text_empty_choices() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/chat/completions")
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"choices": []}"#)
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "test-key".to_string(),
            client,
            server.url(),
        );

        let response = provider
            .generate_text(TextGenerationRequest {
                prompt: "Test".to_string(),
                system_prompt: None,
                max_tokens: None,
            })
            .await;

        mock.assert();
        assert!(response.is_ok());
        assert_eq!(response.unwrap().text, "");
    }

    #[test]
    fn test_provider_name() {
        let provider = OpenAiProvider::new("test".to_string());
        assert_eq!(provider.provider_name(), "openai");
    }

    #[test]
    fn test_chat_completion_request_serialization() {
        let request = ChatCompletionRequest {
            model: "gpt-4o".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
            }],
            max_tokens: Some(100),
        };
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("gpt-4o"));
        assert!(json.contains("max_tokens"));
    }

    #[test]
    fn test_chat_completion_request_no_max_tokens() {
        let request = ChatCompletionRequest {
            model: "gpt-4o".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
            }],
            max_tokens: None,
        };
        let json = serde_json::to_string(&request).unwrap();
        assert!(!json.contains("max_tokens"));
    }

    #[test]
    fn test_with_timeout_configuration() {
        let provider = OpenAiProvider::new("test".to_string()).with_timeout(60);
        assert_eq!(provider.timeout_secs, 60);
    }

    #[test]
    fn test_with_max_retries_configuration() {
        let provider = OpenAiProvider::new("test".to_string()).with_max_retries(5);
        assert_eq!(provider.max_retries, 5);
    }

    #[test]
    fn test_calculate_retry_delay() {
        assert_eq!(OpenAiProvider::calculate_retry_delay(0), 100);
        assert_eq!(OpenAiProvider::calculate_retry_delay(1), 200);
        assert_eq!(OpenAiProvider::calculate_retry_delay(2), 400);
        assert_eq!(OpenAiProvider::calculate_retry_delay(3), 800);
    }

    #[tokio::test]
    async fn test_transcribe_rate_limited_error() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/audio/transcriptions")
            .with_status(429)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Rate limit exceeded"}}"#)
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "test-key".to_string(),
            client,
            server.url(),
        )
        .with_max_retries(0);

        let response = provider
            .transcribe(TranscriptionRequest {
                audio_data: vec![0u8; 100],
                language: None,
            })
            .await;

        mock.assert();
        assert!(response.is_err());
        if let Err(AiError::RateLimited(_)) = response {
        } else {
            panic!("Expected RateLimited error");
        }
    }

    #[tokio::test]
    async fn test_transcribe_auth_failed_error() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/audio/transcriptions")
            .with_status(401)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Invalid API key"}}"#)
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "invalid-key".to_string(),
            client,
            server.url(),
        )
        .with_max_retries(0);

        let response = provider
            .transcribe(TranscriptionRequest {
                audio_data: vec![0u8; 100],
                language: None,
            })
            .await;

        mock.assert();
        assert!(response.is_err());
        if let Err(AiError::AuthenticationFailed(_)) = response {
        } else {
            panic!("Expected AuthenticationFailed error");
        }
    }

    #[tokio::test]
    async fn test_transcribe_retry_on_server_error() {
        let mut server = Server::new_async().await;
        
        let mock1 = server
            .mock("POST", "/audio/transcriptions")
            .with_status(500)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Internal server error"}}"#)
            .expect(1)
            .create();
        
        let mock2 = server
            .mock("POST", "/audio/transcriptions")
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"text": "Success after retry"}"#)
            .expect(1)
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "test-key".to_string(),
            client,
            server.url(),
        )
        .with_max_retries(2);

        let response = provider
            .transcribe(TranscriptionRequest {
                audio_data: vec![0u8; 100],
                language: None,
            })
            .await;

        mock1.assert();
        mock2.assert();
        assert!(response.is_ok());
        assert_eq!(response.unwrap().text, "Success after retry");
    }

    #[tokio::test]
    async fn test_transcribe_max_retries_exceeded() {
        let mut server = Server::new_async().await;
        
        let mock = server
            .mock("POST", "/audio/transcriptions")
            .with_status(500)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Internal server error"}}"#)
            .expect(2)
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "test-key".to_string(),
            client,
            server.url(),
        )
        .with_max_retries(1);

        let response = provider
            .transcribe(TranscriptionRequest {
                audio_data: vec![0u8; 100],
                language: None,
            })
            .await;

        mock.assert();
        assert!(response.is_err());
        if let Err(AiError::HttpError(msg)) = response {
            assert!(msg.contains("Internal server error"));
        } else {
            panic!("Expected HttpError");
        }
    }

    #[tokio::test]
    async fn test_generate_text_retry_on_server_error() {
        let mut server = Server::new_async().await;
        
        let mock1 = server
            .mock("POST", "/chat/completions")
            .with_status(502)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Bad gateway"}}"#)
            .expect(1)
            .create();
        
        let mock2 = server
            .mock("POST", "/chat/completions")
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"choices": [{"message": {"role": "assistant", "content": "Retried"}}]}"#)
            .expect(1)
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "test-key".to_string(),
            client,
            server.url(),
        )
        .with_max_retries(2);

        let response = provider
            .generate_text(TextGenerationRequest {
                prompt: "Test".to_string(),
                system_prompt: None,
                max_tokens: None,
            })
            .await;

        mock1.assert();
        mock2.assert();
        assert!(response.is_ok());
        assert_eq!(response.unwrap().text, "Retried");
    }
}
