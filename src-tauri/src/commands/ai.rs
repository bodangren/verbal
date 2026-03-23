use crate::ai::google::GoogleProvider;
use crate::ai::openai::OpenAiProvider;
use crate::ai::{
    AiError, AiProvider, Provider, TextGenerationRequest, TextGenerationResponse,
    TranscriptionRequest, TranscriptionResponse,
};
use crate::CredentialManager;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

pub type AiProviderState = Arc<RwLock<Option<AiProviderHolder>>>;

pub struct AiProviderHolder {
    pub provider: Provider,
    pub openai: Option<OpenAiProvider>,
    pub google: Option<GoogleProvider>,
}

impl AiProviderHolder {
    pub fn new() -> Self {
        Self {
            provider: Provider::OpenAI,
            openai: None,
            google: None,
        }
    }

    pub fn get_provider(&self) -> Result<&dyn AiProvider, AiError> {
        match self.provider {
            Provider::OpenAI => self
                .openai
                .as_ref()
                .map(|p| p as &dyn AiProvider)
                .ok_or_else(|| AiError::MissingApiKey("openai".to_string())),
            Provider::Google => self
                .google
                .as_ref()
                .map(|p| p as &dyn AiProvider)
                .ok_or_else(|| AiError::MissingApiKey("google".to_string())),
        }
    }
}

impl Default for AiProviderHolder {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub async fn configure_provider(
    state: State<'_, AiProviderState>,
    provider: String,
    api_key: String,
) -> Result<(), AiError> {
    let provider_enum: Provider = provider
        .parse()
        .map_err(|_| AiError::ProviderNotAvailable(provider.clone()))?;

    let cred_manager = CredentialManager::new();
    cred_manager.store_api_key(&provider_enum, &api_key)?;

    let mut holder = state.write().await;
    
    if holder.is_none() {
        *holder = Some(AiProviderHolder::new());
    }
    
    let holder = holder.as_mut().unwrap();
    holder.provider = provider_enum.clone();

    match provider_enum {
        Provider::OpenAI => {
            holder.openai = Some(OpenAiProvider::new(api_key));
        }
        Provider::Google => {
            holder.google = Some(GoogleProvider::new(api_key));
        }
    }

    tracing::info!("Configured AI provider: {}", provider);
    Ok(())
}

#[tauri::command]
pub async fn set_active_provider(
    state: State<'_, AiProviderState>,
    provider: String,
) -> Result<(), AiError> {
    let provider_enum: Provider = provider
        .parse()
        .map_err(|_| AiError::ProviderNotAvailable(provider.clone()))?;

    let cred_manager = CredentialManager::new();
    
    if !cred_manager.has_api_key(&provider_enum) {
        return Err(AiError::MissingApiKey(provider));
    }

    let mut holder = state.write().await;
    
    if holder.is_none() {
        *holder = Some(AiProviderHolder::new());
    }
    
    let holder = holder.as_mut().unwrap();
    holder.provider = provider_enum.clone();

    if holder.openai.is_none() && provider_enum == Provider::OpenAI {
        if let Ok(key) = cred_manager.get_api_key(&Provider::OpenAI) {
            holder.openai = Some(OpenAiProvider::new(key));
        }
    }

    if holder.google.is_none() && provider_enum == Provider::Google {
        if let Ok(key) = cred_manager.get_api_key(&Provider::Google) {
            holder.google = Some(GoogleProvider::new(key));
        }
    }

    tracing::info!("Set active AI provider: {}", holder.provider);
    Ok(())
}

#[tauri::command]
pub async fn transcribe(
    state: State<'_, AiProviderState>,
    audio_data: Vec<u8>,
    language: Option<String>,
) -> Result<TranscriptionResponse, AiError> {
    let holder = state.read().await;
    
    let provider = holder
        .as_ref()
        .ok_or_else(|| AiError::MissingApiKey("no provider configured".to_string()))?
        .get_provider()?;

    let request = TranscriptionRequest {
        audio_data,
        language,
    };

    provider.transcribe(request).await
}

#[tauri::command]
pub async fn generate_text(
    state: State<'_, AiProviderState>,
    prompt: String,
    system_prompt: Option<String>,
    max_tokens: Option<u32>,
) -> Result<TextGenerationResponse, AiError> {
    let holder = state.read().await;
    
    let provider = holder
        .as_ref()
        .ok_or_else(|| AiError::MissingApiKey("no provider configured".to_string()))?
        .get_provider()?;

    let request = TextGenerationRequest {
        prompt,
        system_prompt,
        max_tokens,
    };

    provider.generate_text(request).await
}

#[tauri::command]
pub async fn get_configured_providers() -> Result<Vec<String>, AiError> {
    let cred_manager = CredentialManager::new();
    let mut configured = Vec::new();

    if cred_manager.has_api_key(&Provider::OpenAI) {
        configured.push("openai".to_string());
    }
    if cred_manager.has_api_key(&Provider::Google) {
        configured.push("google".to_string());
    }

    Ok(configured)
}

#[tauri::command]
pub async fn clear_provider_credentials(provider: String) -> Result<(), AiError> {
    let provider_enum: Provider = provider
        .parse()
        .map_err(|_| AiError::ProviderNotAvailable(provider.clone()))?;

    let cred_manager = CredentialManager::new();
    cred_manager.delete_api_key(&provider_enum)?;

    tracing::info!("Cleared credentials for provider: {}", provider_enum);
    Ok(())
}

pub fn init_ai_state() -> AiProviderState {
    Arc::new(RwLock::new(None))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ai_provider_holder_new() {
        let holder = AiProviderHolder::new();
        assert_eq!(holder.provider, Provider::OpenAI);
        assert!(holder.openai.is_none());
        assert!(holder.google.is_none());
    }

    #[test]
    fn test_ai_provider_holder_get_provider_missing() {
        let holder = AiProviderHolder::new();
        let result = holder.get_provider();
        assert!(result.is_err());
        if let Err(AiError::MissingApiKey(name)) = result {
            assert_eq!(name, "openai");
        } else {
            panic!("Expected MissingApiKey error");
        }
    }

    #[test]
    fn test_ai_provider_holder_get_provider_openai() {
        let mut holder = AiProviderHolder::new();
        holder.openai = Some(OpenAiProvider::new("test-key".to_string()));
        let result = holder.get_provider();
        assert!(result.is_ok());
        assert_eq!(result.unwrap().provider_name(), "openai");
    }

    #[test]
    fn test_ai_provider_holder_get_provider_google() {
        let mut holder = AiProviderHolder::new();
        holder.provider = Provider::Google;
        holder.google = Some(GoogleProvider::new("test-key".to_string()));
        let result = holder.get_provider();
        assert!(result.is_ok());
        assert_eq!(result.unwrap().provider_name(), "google");
    }

    #[test]
    fn test_ai_provider_holder_get_provider_google_missing() {
        let mut holder = AiProviderHolder::new();
        holder.provider = Provider::Google;
        let result = holder.get_provider();
        assert!(result.is_err());
        if let Err(AiError::MissingApiKey(name)) = result {
            assert_eq!(name, "google");
        } else {
            panic!("Expected MissingApiKey error");
        }
    }

    #[test]
    fn test_init_ai_state() {
        let state = init_ai_state();
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let holder = state.read().await;
            assert!(holder.is_none());
        });
    }
}
