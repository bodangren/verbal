use crate::cut_list::CutList;
use crate::error::{Result, VerbalError};
use serde::Serialize;
use std::path::Path;
use std::process::{Command, Output};

pub struct FFmpegExecutor {
    ffmpeg_path: String,
}

impl Default for FFmpegExecutor {
    fn default() -> Self {
        Self::new("ffmpeg")
    }
}

impl FFmpegExecutor {
    pub fn new(ffmpeg_path: &str) -> Self {
        Self {
            ffmpeg_path: ffmpeg_path.to_string(),
        }
    }

    pub fn check_available(&self) -> Result<bool> {
        let output = Command::new(&self.ffmpeg_path)
            .arg("-version")
            .output()
            .map_err(|e| VerbalError::Ffmpeg(format!("FFmpeg not found: {}", e)))?;

        Ok(output.status.success())
    }

    pub fn apply_cuts(
        &self,
        cut_list: &CutList,
        input_path: &Path,
        output_path: &Path,
    ) -> Result<FFmpegResult> {
        if !input_path.exists() {
            return Err(VerbalError::Ffmpeg(format!(
                "Input file does not exist: {}",
                input_path.display()
            )));
        }

        let args = cut_list.generate_ffmpeg_command(
            &input_path.to_string_lossy(),
            &output_path.to_string_lossy(),
        );

        tracing::info!("Executing FFmpeg with {} segments", cut_list.segments.len());
        tracing::debug!("FFmpeg args: {:?}", args);

        let output = self.execute_ffmpeg(&args)?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(VerbalError::Ffmpeg(format!(
                "FFmpeg failed with exit code {:?}: {}",
                output.status.code(),
                stderr
            )));
        }

        let output_size = output_path.metadata().map(|m| m.len()).unwrap_or(0);

        Ok(FFmpegResult {
            output_path: output_path.to_string_lossy().to_string(),
            duration_seconds: cut_list.total_duration(),
            output_size_bytes: output_size,
        })
    }

    fn execute_ffmpeg(&self, args: &[String]) -> Result<Output> {
        if args.is_empty() {
            return Err(VerbalError::Ffmpeg("Empty FFmpeg arguments".to_string()));
        }

        let output = Command::new(&self.ffmpeg_path)
            .args(&args[1..])
            .output()
            .map_err(|e| VerbalError::Ffmpeg(format!("Failed to execute FFmpeg: {}", e)))?;

        Ok(output)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct FFmpegResult {
    pub output_path: String,
    pub duration_seconds: f64,
    pub output_size_bytes: u64,
}

pub fn validate_path_is_within_dir(path: &Path, dir: &Path) -> Result<()> {
    let canonical_path = dunce::canonicalize(path)
        .map_err(|e| VerbalError::MediaProcessing(format!("Invalid path: {}", e)))?;
    let canonical_dir = dunce::canonicalize(dir)
        .map_err(|e| VerbalError::MediaProcessing(format!("Invalid directory: {}", e)))?;

    if !canonical_path.starts_with(&canonical_dir) {
        return Err(VerbalError::MediaProcessing(
            "Path traversal detected: output path outside allowed directory".to_string(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_ffmpeg_executor_default() {
        let executor = FFmpegExecutor::default();
        assert_eq!(executor.ffmpeg_path, "ffmpeg");
    }

    #[test]
    fn test_ffmpeg_executor_custom_path() {
        let executor = FFmpegExecutor::new("/usr/local/bin/ffmpeg");
        assert_eq!(executor.ffmpeg_path, "/usr/local/bin/ffmpeg");
    }

    #[test]
    fn test_ffmpeg_check_available() {
        let executor = FFmpegExecutor::default();
        let result = executor.check_available();
        assert!(result.is_ok());
    }

    #[test]
    fn test_apply_cuts_missing_input() {
        let executor = FFmpegExecutor::default();
        let cut_list = CutList::parse_json(r#"[{"start": 0.0, "end": 5.0}]"#).unwrap();
        let result = executor.apply_cuts(
            &cut_list,
            Path::new("/nonexistent/input.webm"),
            Path::new("/tmp/output.webm"),
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("does not exist"));
    }

    #[test]
    fn test_validate_path_is_within_dir_valid() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("output.webm");

        File::create(&file_path)
            .unwrap()
            .write_all(b"test")
            .unwrap();

        let result = validate_path_is_within_dir(&file_path, dir.path());
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_path_is_within_dir_traversal() {
        let dir = tempdir().unwrap();
        let parent_file = dir.path().parent().unwrap().join("secret.txt");

        File::create(&parent_file)
            .unwrap()
            .write_all(b"secret")
            .unwrap();

        let result = validate_path_is_within_dir(&parent_file, dir.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_path_nonexistent() {
        let result =
            validate_path_is_within_dir(Path::new("/nonexistent/path.webm"), Path::new("/tmp"));
        assert!(result.is_err());
    }

    #[test]
    fn test_ffmpeg_result_fields() {
        let result = FFmpegResult {
            output_path: "/tmp/output.webm".to_string(),
            duration_seconds: 10.5,
            output_size_bytes: 1024,
        };
        assert_eq!(result.output_path, "/tmp/output.webm");
        assert_eq!(result.duration_seconds, 10.5);
        assert_eq!(result.output_size_bytes, 1024);
    }
}
