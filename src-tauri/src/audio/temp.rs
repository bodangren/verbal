use crate::error::{Result, VerbalError};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct TempFileManager {
    temp_dir: PathBuf,
}

impl TempFileManager {
    pub fn new(temp_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&temp_dir).map_err(|e| {
            VerbalError::MediaProcessing(format!("Failed to create temp directory: {}", e))
        })?;
        Ok(Self { temp_dir })
    }

    pub fn create_temp_audio_path(&self, extension: &str) -> Result<PathBuf> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| VerbalError::MediaProcessing(format!("System time error: {}", e)))?
            .as_micros();

        let filename = format!("audio_{}.{}", timestamp, extension);
        Ok(self.temp_dir.join(filename))
    }

    pub fn cleanup_file(path: &PathBuf) {
        if path.exists() {
            if let Err(e) = std::fs::remove_file(path) {
                tracing::warn!("Failed to cleanup temp file {}: {}", path.display(), e);
            }
        }
    }

    pub fn cleanup_dir(&self) -> Result<()> {
        if self.temp_dir.exists() {
            std::fs::remove_dir_all(&self.temp_dir).map_err(|e| {
                VerbalError::MediaProcessing(format!("Failed to cleanup temp directory: {}", e))
            })?;
        }
        Ok(())
    }
}

pub struct TempFile {
    pub path: PathBuf,
}

impl TempFile {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        TempFileManager::cleanup_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_temp_file_manager_new() {
        let dir = tempdir().unwrap();
        let temp_path = dir.path().to_path_buf();
        let manager = TempFileManager::new(temp_path.clone());
        assert!(manager.is_ok());
    }

    #[test]
    fn test_temp_file_manager_creates_dir() {
        let dir = tempdir().unwrap();
        let temp_path = dir.path().join("subdir").join("temp");
        let manager = TempFileManager::new(temp_path.clone()).unwrap();
        assert!(temp_path.exists());
    }

    #[test]
    fn test_create_temp_audio_path() {
        let dir = tempdir().unwrap();
        let manager = TempFileManager::new(dir.path().to_path_buf()).unwrap();
        let path = manager.create_temp_audio_path("wav").unwrap();
        assert!(path.to_string_lossy().ends_with(".wav"));
        assert!(path.to_string_lossy().contains("audio_"));
    }

    #[test]
    fn test_create_temp_audio_path_unique() {
        let dir = tempdir().unwrap();
        let manager = TempFileManager::new(dir.path().to_path_buf()).unwrap();
        let path1 = manager.create_temp_audio_path("wav").unwrap();
        let path2 = manager.create_temp_audio_path("wav").unwrap();
        assert_ne!(path1, path2);
    }

    #[test]
    fn test_cleanup_file_removes_existing() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");
        fs::write(&file_path, "test").unwrap();
        assert!(file_path.exists());
        TempFileManager::cleanup_file(&file_path);
        assert!(!file_path.exists());
    }

    #[test]
    fn test_cleanup_file_nonexistent_no_error() {
        let file_path = PathBuf::from("/nonexistent/file.txt");
        TempFileManager::cleanup_file(&file_path);
    }

    #[test]
    fn test_temp_file_auto_cleanup() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("auto_cleanup.txt");
        fs::write(&file_path, "test").unwrap();
        assert!(file_path.exists());

        {
            let _temp = TempFile::new(file_path.clone());
        }

        assert!(!file_path.exists());
    }

    #[test]
    fn test_cleanup_dir() {
        let dir = tempdir().unwrap();
        let temp_path = dir.path().join("cleanup_test");
        fs::create_dir_all(&temp_path).unwrap();
        fs::write(temp_path.join("file.txt"), "test").unwrap();

        let manager = TempFileManager::new(temp_path.clone()).unwrap();
        manager.cleanup_dir().unwrap();

        assert!(!temp_path.exists());
    }
}
