#![allow(dead_code)]

use crate::ai::{
    AiError, AiProvider, AiResult, TextGenerationRequest, TextGenerationResponse,
    TranscriptionRequest, TranscriptionResponse,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

const GEMINI_API_BASE: &str = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_SECS: u64 = 30;
const MAX_RETRIES: u32 = 3;
const INITIAL_RETRY_DELAY_MS: u64 = 100;

pub struct GoogleProvider {
    api_key: String,
    client: reqwest::Client,
    base_url: String,
    timeout_secs: u64,
    max_retries: u32,
}

impl GoogleProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::new(),
            base_url: GEMINI_API_BASE.to_string(),
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

    fn should_retry(error: &AiError) -> bool {
        matches!(error, AiError::HttpError(_) | AiError::Timeout)
    }

    async fn transcribe_with_retry(
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

    async fn transcribe_once(
        &self,
        request: &TranscriptionRequest,
    ) -> AiResult<TranscriptionResponse> {
        let audio_base64 = base64_encode(&request.audio_data);
        let mime_type = "audio/mp3";

        let body = GeminiTranscriptionRequest {
            contents: vec![GeminiContent {
                parts: vec![
                    GeminiPart {
                        text: Some("Transcribe this audio file. Provide only the transcription text, no additional commentary.".to_string()),
                        inline_data: None,
                    },
                    GeminiPart {
                        text: None,
                        inline_data: Some(GeminiInlineData {
                            mime_type: mime_type.to_string(),
                            data: audio_base64,
                        }),
                    },
                ],
            }],
            generation_config: Some(GeminiGenerationConfig {
                temperature: 0.1,
            }),
        };

        let response = self
            .client
            .post(format!(
                "{}/models/gemini-1.5-flash:generateContent?key={}",
                self.base_url, self.api_key
            ))
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
            return Err(self.map_error_response(response).await);
        }

        let gemini_response: GeminiResponse = response
            .json()
            .await
            .map_err(|e| AiError::InvalidResponse(e.to_string()))?;

        let text = gemini_response
            .candidates
            .first()
            .and_then(|c| c.content.parts.first())
            .and_then(|p| p.text.clone())
            .unwrap_or_default();

        Ok(TranscriptionResponse {
            text,
            words: vec![],
        })
    }

    async fn generate_text_with_retry(
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
        let mut parts = vec![];
        
        if let Some(ref system) = request.system_prompt {
            parts.push(GeminiPart {
                text: Some(format!("System: {}", system)),
                inline_data: None,
            });
        }
        
        parts.push(GeminiPart {
            text: Some(request.prompt.clone()),
            inline_data: None,
        });

        let body = GeminiTextRequest {
            contents: vec![GeminiContent { parts }],
            generation_config: Some(GeminiGenerationConfig {
                temperature: 0.7,
            }),
        };

        let response = self
            .client
            .post(format!(
                "{}/models/gemini-1.5-flash:generateContent?key={}",
                self.base_url, self.api_key
            ))
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
            return Err(self.map_error_response(response).await);
        }

        let gemini_response: GeminiResponse = response
            .json()
            .await
            .map_err(|e| AiError::InvalidResponse(e.to_string()))?;

        let text = gemini_response
            .candidates
            .first()
            .and_then(|c| c.content.parts.first())
            .and_then(|p| p.text.clone())
            .unwrap_or_default();

        Ok(TextGenerationResponse { text })
    }

    async fn map_error_response(&self, response: reqwest::Response) -> AiError {
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
}

fn base64_encode(data: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD.encode(data)
}

#[async_trait]
impl AiProvider for GoogleProvider {
    fn provider_name(&self) -> &str {
        "google"
    }

    async fn transcribe(&self, request: TranscriptionRequest) -> AiResult<TranscriptionResponse> {
        self.transcribe_with_retry(request).await
    }

    async fn generate_text(
        &self,
        request: TextGenerationRequest,
    ) -> AiResult<TextGenerationResponse> {
        self.generate_text_with_retry(request).await
    }
}

#[derive(Debug, Serialize)]
struct GeminiTranscriptionRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Debug, Serialize)]
struct GeminiTextRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    inline_data: Option<GeminiInlineData>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeminiInlineData {
    mime_type: String,
    data: String,
}

#[derive(Debug, Serialize)]
struct GeminiGenerationConfig {
    temperature: f32,
}

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
}

#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::Server;

    #[test]
    fn test_provider_name() {
        let provider = GoogleProvider::new("test-key".to_string());
        assert_eq!(provider.provider_name(), "google");
    }

    #[test]
    fn test_with_timeout_configuration() {
        let provider = GoogleProvider::new("test".to_string()).with_timeout(60);
        assert_eq!(provider.timeout_secs, 60);
    }

    #[test]
    fn test_with_max_retries_configuration() {
        let provider = GoogleProvider::new("test".to_string()).with_max_retries(5);
        assert_eq!(provider.max_retries, 5);
    }

    #[test]
    fn test_calculate_retry_delay() {
        assert_eq!(GoogleProvider::calculate_retry_delay(0), 100);
        assert_eq!(GoogleProvider::calculate_retry_delay(1), 200);
        assert_eq!(GoogleProvider::calculate_retry_delay(2), 400);
    }

    #[tokio::test]
    async fn test_generate_text_success() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/models/gemini-1.5-flash:generateContent")
            .match_query(mockito::Matcher::Regex("key=test-api-key".to_string()))
            .match_header("Content-Type", "application/json")
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(
                r#"{
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {"text": "Hello from Gemini!"}
                                ]
                            }
                        }
                    ]
                }"#,
            )
            .create();

        let client = reqwest::Client::new();
        let provider = GoogleProvider::with_client(
            "test-api-key".to_string(),
            client,
            server.url(),
        )
        .with_max_retries(0);

        let response = provider
            .generate_text(TextGenerationRequest {
                prompt: "Say hello".to_string(),
                system_prompt: None,
                max_tokens: None,
            })
            .await;

        mock.assert();
        assert!(response.is_ok());
        let gen = response.unwrap();
        assert_eq!(gen.text, "Hello from Gemini!");
    }

    #[tokio::test]
    async fn test_generate_text_with_system_prompt() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/models/gemini-1.5-flash:generateContent")
            .match_query(mockito::Matcher::Regex("key=test-key".to_string()))
            .match_header("Content-Type", "application/json")
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(
                r#"{
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {"text": "System response"}
                                ]
                            }
                        }
                    ]
                }"#,
            )
            .create();

        let client = reqwest::Client::new();
        let provider = GoogleProvider::with_client(
            "test-key".to_string(),
            client,
            server.url(),
        )
        .with_max_retries(0);

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
    async fn test_generate_text_auth_failed() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/models/gemini-1.5-flash:generateContent")
            .match_query(mockito::Matcher::Regex("key=invalid".to_string()))
            .with_status(401)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Invalid API key"}}"#)
            .create();

        let client = reqwest::Client::new();
        let provider = GoogleProvider::with_client(
            "invalid".to_string(),
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
        if let Err(AiError::AuthenticationFailed(_)) = response {
        } else {
            panic!("Expected AuthenticationFailed error");
        }
    }

    #[tokio::test]
    async fn test_generate_text_rate_limited() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/models/gemini-1.5-flash:generateContent")
            .match_query(mockito::Matcher::Regex("key=test-key".to_string()))
            .with_status(429)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Rate limit exceeded"}}"#)
            .create();

        let client = reqwest::Client::new();
        let provider = GoogleProvider::with_client(
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
        if let Err(AiError::RateLimited(_)) = response {
        } else {
            panic!("Expected RateLimited error");
        }
    }

    #[tokio::test]
    async fn test_generate_text_retry_on_server_error() {
        let mut server = Server::new_async().await;
        
        let mock1 = server
            .mock("POST", "/models/gemini-1.5-flash:generateContent")
            .match_query(mockito::Matcher::Regex("key=test-key".to_string()))
            .with_status(500)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Internal server error"}}"#)
            .expect(1)
            .create();
        
        let mock2 = server
            .mock("POST", "/models/gemini-1.5-flash:generateContent")
            .match_query(mockito::Matcher::Regex("key=test-key".to_string()))
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"candidates": [{"content": {"parts": [{"text": "Retried"}]}}]}"#)
            .expect(1)
            .create();

        let client = reqwest::Client::new();
        let provider = GoogleProvider::with_client(
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

    #[tokio::test]
    async fn test_transcribe_success() {
        let mut server = Server::new_async().await;
        let mock = server
            .mock("POST", "/models/gemini-1.5-flash:generateContent")
            .match_query(mockito::Matcher::Regex("key=test-api-key".to_string()))
            .match_header("Content-Type", "application/json")
            .with_status(200)
            .with_header("Content-Type", "application/json")
            .with_body(
                r#"{
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {"text": "This is a transcription of the audio."}
                                ]
                            }
                        }
                    ]
                }"#,
            )
            .create();

        let client = reqwest::Client::new();
        let provider = GoogleProvider::with_client(
            "test-api-key".to_string(),
            client,
            server.url(),
        )
        .with_max_retries(0);

        let response = provider
            .transcribe(TranscriptionRequest {
                audio_data: vec![0u8; 100],
                language: Some("en".to_string()),
            })
            .await;

        mock.assert();
        assert!(response.is_ok());
        let transcription = response.unwrap();
        assert_eq!(transcription.text, "This is a transcription of the audio.");
        assert!(transcription.words.is_empty());
    }

    #[test]
    fn test_base64_encode() {
        let input = b"hello";
        let encoded = base64_encode(input);
        assert_eq!(encoded, "aGVsbG8=");
    }
}
