use crate::error::{Result, VerbalError};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioFormat {
    Wav,
    Mp3,
    Flac,
}

impl AudioFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            AudioFormat::Wav => "wav",
            AudioFormat::Mp3 => "mp3",
            AudioFormat::Flac => "flac",
        }
    }

    pub fn ffmpeg_codec(&self) -> &'static str {
        match self {
            AudioFormat::Wav => "pcm_s16le",
            AudioFormat::Mp3 => "libmp3lame",
            AudioFormat::Flac => "flac",
        }
    }

    pub fn mime_type(&self) -> &'static str {
        match self {
            AudioFormat::Wav => "audio/wav",
            AudioFormat::Mp3 => "audio/mpeg",
            AudioFormat::Flac => "audio/flac",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ExtractionConfig {
    pub format: AudioFormat,
    pub sample_rate: Option<u32>,
    pub channels: Option<u8>,
}

impl Default for ExtractionConfig {
    fn default() -> Self {
        Self {
            format: AudioFormat::Wav,
            sample_rate: Some(16000),
            channels: Some(1),
        }
    }
}

impl ExtractionConfig {
    pub fn for_transcription() -> Self {
        Self {
            format: AudioFormat::Wav,
            sample_rate: Some(16000),
            channels: Some(1),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ExtractionResult {
    pub audio_path: PathBuf,
    pub format: String,
    pub sample_rate: u32,
    pub channels: u8,
    pub duration_seconds: f64,
}

pub struct AudioExtractor {
    ffmpeg_path: String,
    ffprobe_path: String,
}

impl Default for AudioExtractor {
    fn default() -> Self {
        Self::new("ffmpeg", "ffprobe")
    }
}

impl AudioExtractor {
    pub fn new(ffmpeg_path: &str, ffprobe_path: &str) -> Self {
        Self {
            ffmpeg_path: ffmpeg_path.to_string(),
            ffprobe_path: ffprobe_path.to_string(),
        }
    }

    pub fn extract_audio(
        &self,
        input_path: &Path,
        output_path: &Path,
        config: &ExtractionConfig,
    ) -> Result<ExtractionResult> {
        if !input_path.exists() {
            return Err(VerbalError::MediaProcessing(format!(
                "Input file does not exist: {}",
                input_path.display()
            )));
        }

        let duration = self.get_duration(input_path)?;

        let mut args = vec![
            "-y".to_string(),
            "-i".to_string(),
            input_path.to_string_lossy().to_string(),
            "-vn".to_string(),
            "-acodec".to_string(),
            config.format.ffmpeg_codec().to_string(),
        ];

        if let Some(sr) = config.sample_rate {
            args.push("-ar".to_string());
            args.push(sr.to_string());
        }

        if let Some(ch) = config.channels {
            args.push("-ac".to_string());
            args.push(ch.to_string());
        }

        args.push(output_path.to_string_lossy().to_string());

        tracing::info!("Extracting audio from {}", input_path.display());
        tracing::debug!("FFmpeg args: {:?}", args);

        let output = Command::new(&self.ffmpeg_path)
            .args(&args)
            .output()
            .map_err(|e| VerbalError::Ffmpeg(format!("Failed to execute FFmpeg: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(VerbalError::Ffmpeg(format!(
                "Audio extraction failed: {}",
                stderr
            )));
        }

        if !output_path.exists() {
            return Err(VerbalError::MediaProcessing(
                "Audio extraction produced no output file".to_string(),
            ));
        }

        Ok(ExtractionResult {
            audio_path: output_path.to_path_buf(),
            format: config.format.extension().to_string(),
            sample_rate: config.sample_rate.unwrap_or(44100),
            channels: config.channels.unwrap_or(2),
            duration_seconds: duration,
        })
    }

    fn get_duration(&self, input_path: &Path) -> Result<f64> {
        let output = Command::new(&self.ffprobe_path)
            .args([
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                &input_path.to_string_lossy(),
            ])
            .output()
            .map_err(|e| VerbalError::Ffmpeg(format!("Failed to execute ffprobe: {}", e)))?;

        if !output.status.success() {
            return Err(VerbalError::Ffmpeg(
                "Failed to get media duration".to_string(),
            ));
        }

        let duration_str = String::from_utf8_lossy(&output.stdout);
        duration_str
            .trim()
            .parse::<f64>()
            .map_err(|e| VerbalError::MediaProcessing(format!("Invalid duration: {}", e)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_audio_format_extension() {
        assert_eq!(AudioFormat::Wav.extension(), "wav");
        assert_eq!(AudioFormat::Mp3.extension(), "mp3");
        assert_eq!(AudioFormat::Flac.extension(), "flac");
    }

    #[test]
    fn test_audio_format_ffmpeg_codec() {
        assert_eq!(AudioFormat::Wav.ffmpeg_codec(), "pcm_s16le");
        assert_eq!(AudioFormat::Mp3.ffmpeg_codec(), "libmp3lame");
        assert_eq!(AudioFormat::Flac.ffmpeg_codec(), "flac");
    }

    #[test]
    fn test_audio_format_mime_type() {
        assert_eq!(AudioFormat::Wav.mime_type(), "audio/wav");
        assert_eq!(AudioFormat::Mp3.mime_type(), "audio/mpeg");
        assert_eq!(AudioFormat::Flac.mime_type(), "audio/flac");
    }

    #[test]
    fn test_extraction_config_default() {
        let config = ExtractionConfig::default();
        assert_eq!(config.format, AudioFormat::Wav);
        assert_eq!(config.sample_rate, Some(16000));
        assert_eq!(config.channels, Some(1));
    }

    #[test]
    fn test_extraction_config_for_transcription() {
        let config = ExtractionConfig::for_transcription();
        assert_eq!(config.format, AudioFormat::Wav);
        assert_eq!(config.sample_rate, Some(16000));
        assert_eq!(config.channels, Some(1));
    }

    #[test]
    fn test_audio_extractor_default() {
        let extractor = AudioExtractor::default();
        assert_eq!(extractor.ffmpeg_path, "ffmpeg");
        assert_eq!(extractor.ffprobe_path, "ffprobe");
    }

    #[test]
    fn test_audio_extractor_custom_paths() {
        let extractor = AudioExtractor::new("/usr/local/bin/ffmpeg", "/usr/local/bin/ffprobe");
        assert_eq!(extractor.ffmpeg_path, "/usr/local/bin/ffmpeg");
        assert_eq!(extractor.ffprobe_path, "/usr/local/bin/ffprobe");
    }

    #[test]
    fn test_extract_audio_missing_input() {
        let extractor = AudioExtractor::default();
        let config = ExtractionConfig::default();
        let result = extractor.extract_audio(
            Path::new("/nonexistent/input.webm"),
            Path::new("/tmp/output.wav"),
            &config,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("does not exist"));
    }

    #[test]
    fn test_extraction_result_serialization() {
        let result = ExtractionResult {
            audio_path: PathBuf::from("/tmp/audio.wav"),
            format: "wav".to_string(),
            sample_rate: 16000,
            channels: 1,
            duration_seconds: 30.5,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("audio.wav"));
        assert!(json.contains("16000"));
        assert!(json.contains("30.5"));
    }
}
