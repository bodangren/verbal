use crate::error::Result;

#[tauri::command]
pub fn greet(name: &str) -> Result<String> {
    tracing::info!("Greeting user: {}", name);
    Ok(format!("Hello, {}! You've been greeted from Rust!", name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greet_returns_greeting() {
        let result = greet("World").unwrap();
        assert!(result.contains("World"));
    }
}
