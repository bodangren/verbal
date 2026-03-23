use crate::ai::{
    AiError, AiProvider, AiResult, TextGenerationRequest, TextGenerationResponse,
    TranscriptionRequest, TranscriptionResponse, WordTimestamp,
};
use async_trait::async_trait;
use reqwest::multipart;
use serde::{Deserialize, Serialize};

const OPENAI_API_BASE: &str = "https://api.openai.com/v1";

pub struct OpenAiProvider {
    api_key: String,
    client: reqwest::Client,
    base_url: String,
}

impl OpenAiProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::new(),
            base_url: OPENAI_API_BASE.to_string(),
        }
    }

    pub fn with_base_url(api_key: String, base_url: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::new(),
            base_url,
        }
    }

    pub fn with_client(api_key: String, client: reqwest::Client, base_url: String) -> Self {
        Self {
            api_key,
            client,
            base_url,
        }
    }

    async fn transcribe_with_client(
        &self,
        request: TranscriptionRequest,
    ) -> AiResult<TranscriptionResponse> {
        let mut form = multipart::Form::new()
            .text("model", "whisper-1")
            .text("response_format", "verbose_json")
            .part(
                "file",
                multipart::Part::bytes(request.audio_data)
                    .file_name("audio.mp3")
                    .mime_str("audio/mpeg")
                    .map_err(|e| AiError::HttpError(e.to_string()))?,
            );

        if let Some(lang) = request.language {
            form = form.text("language", lang);
        }

        let response = self
            .client
            .post(format!("{}/audio/transcriptions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| AiError::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AiError::ApiError(error_text));
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

    async fn generate_text_with_client(
        &self,
        request: TextGenerationRequest,
    ) -> AiResult<TextGenerationResponse> {
        let messages = if let Some(system) = request.system_prompt {
            vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: system,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: request.prompt,
                },
            ]
        } else {
            vec![ChatMessage {
                role: "user".to_string(),
                content: request.prompt,
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
            .json(&body)
            .send()
            .await
            .map_err(|e| AiError::HttpError(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AiError::ApiError(error_text));
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
            .with_status(401)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Invalid API key"}}"#)
            .create();

        let client = reqwest::Client::new();
        let provider = OpenAiProvider::with_client(
            "invalid-key".to_string(),
            client,
            server.url(),
        );

        let response = provider
            .transcribe(TranscriptionRequest {
                audio_data: vec![0u8; 100],
                language: None,
            })
            .await;

        mock.assert();
        assert!(response.is_err());
        if let Err(AiError::ApiError(msg)) = response {
            assert!(msg.contains("Invalid API key"));
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
            .with_status(429)
            .with_header("Content-Type", "application/json")
            .with_body(r#"{"error": {"message": "Rate limit exceeded"}}"#)
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
        assert!(response.is_err());
        if let Err(AiError::ApiError(msg)) = response {
            assert!(msg.contains("Rate limit"));
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
}
