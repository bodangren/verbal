use crate::ai::{AiError, AiResult, Provider};

pub struct CredentialManager {
    service_name: String,
}

impl CredentialManager {
    pub fn new() -> Self {
        Self {
            service_name: "verbal-app".to_string(),
        }
    }

    pub fn with_service_name(service_name: String) -> Self {
        Self { service_name }
    }

    pub fn store_api_key(&self, provider: &Provider, api_key: &str) -> AiResult<()> {
        if api_key.is_empty() {
            return Err(AiError::CredentialError(
                "API key cannot be empty".to_string(),
            ));
        }

        let key = format!("{}_api_key", provider);
        self.store_credential(&key, api_key)
    }

    pub fn get_api_key(&self, provider: &Provider) -> AiResult<String> {
        let key = format!("{}_api_key", provider);
        self.get_credential(&key)
    }

    pub fn delete_api_key(&self, provider: &Provider) -> AiResult<()> {
        let key = format!("{}_api_key", provider);
        self.delete_credential(&key)
    }

    pub fn has_api_key(&self, provider: &Provider) -> bool {
        self.get_api_key(provider).is_ok()
    }

    fn store_credential(&self, key: &str, value: &str) -> AiResult<()> {
        let entry = keyring::Entry::new(&self.service_name, key)
            .map_err(|e| AiError::CredentialError(e.to_string()))?;
        entry
            .set_password(value)
            .map_err(|e| AiError::CredentialError(e.to_string()))?;
        Ok(())
    }

    fn get_credential(&self, key: &str) -> AiResult<String> {
        let entry = keyring::Entry::new(&self.service_name, key)
            .map_err(|e| AiError::CredentialError(e.to_string()))?;
        entry
            .get_password()
            .map_err(|e| AiError::CredentialError(e.to_string()))
    }

    fn delete_credential(&self, key: &str) -> AiResult<()> {
        let entry = keyring::Entry::new(&self.service_name, key)
            .map_err(|e| AiError::CredentialError(e.to_string()))?;
        entry
            .delete_credential()
            .map_err(|e| AiError::CredentialError(e.to_string()))?;
        Ok(())
    }
}

impl Default for CredentialManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_manager_new() {
        let manager = CredentialManager::new();
        assert_eq!(manager.service_name, "verbal-app");
    }

    #[test]
    fn test_credential_manager_custom_service_name() {
        let manager = CredentialManager::with_service_name("custom-service".to_string());
        assert_eq!(manager.service_name, "custom-service");
    }

    #[test]
    fn test_store_empty_api_key_fails() {
        let manager = CredentialManager::new();
        let result = manager.store_api_key(&Provider::OpenAI, "");
        assert!(result.is_err());
        if let Err(AiError::CredentialError(msg)) = result {
            assert!(msg.contains("cannot be empty"));
        } else {
            panic!("Expected CredentialError");
        }
    }

    #[test]
    fn test_api_key_key_format() {
        let openai_key = format!("{}_api_key", Provider::OpenAI);
        assert_eq!(openai_key, "openai_api_key");

        let google_key = format!("{}_api_key", Provider::Google);
        assert_eq!(google_key, "google_api_key");
    }
}
