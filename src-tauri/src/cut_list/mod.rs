use crate::error::{Result, VerbalError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TimeSegment {
    pub start: f64,
    pub end: f64,
}

impl TimeSegment {
    pub fn new(start: f64, end: f64) -> Result<Self> {
        if start < 0.0 || end < 0.0 {
            return Err(VerbalError::InvalidCutList(
                "Time values cannot be negative".to_string(),
            ));
        }
        if start >= end {
            return Err(VerbalError::InvalidCutList(
                "Start time must be less than end time".to_string(),
            ));
        }
        Ok(Self { start, end })
    }

    pub fn duration(&self) -> f64 {
        self.end - self.start
    }

    pub fn to_ffmpeg_seek(&self) -> String {
        format!("{:.3}", self.start)
    }

    pub fn to_ffmpeg_duration(&self) -> String {
        format!("{:.3}", self.duration())
    }
}

#[derive(Debug, Clone, Default)]
pub struct CutList {
    pub segments: Vec<TimeSegment>,
}

impl CutList {
    pub fn new() -> Self {
        Self { segments: vec![] }
    }

    pub fn from_segments(segments: Vec<TimeSegment>) -> Self {
        Self { segments }
    }

    pub fn parse_json(json: &str) -> Result<Self> {
        let raw_segments: Vec<RawSegment> = serde_json::from_str(json)?;

        if raw_segments.is_empty() {
            return Err(VerbalError::InvalidCutList(
                "Cut list cannot be empty".to_string(),
            ));
        }

        let mut segments = Vec::with_capacity(raw_segments.len());
        for raw in raw_segments {
            segments.push(TimeSegment::new(raw.start, raw.end)?);
        }

        segments.sort_by(|a, b| {
            a.start
                .partial_cmp(&b.start)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(Self { segments })
    }

    pub fn total_duration(&self) -> f64 {
        self.segments.iter().map(|s| s.duration()).sum()
    }

    pub fn generate_ffmpeg_filter_complex(&self) -> String {
        let trim_parts: Vec<String> = self
            .segments
            .iter()
            .enumerate()
            .map(|(i, seg)| {
                format!(
                    "[0:v]trim=start={}:end={},setpts=PTS-STARTPTS[v{}];[0:a]trim=start={}:end={},asetpts=PTS-STARTPTS[a{}]",
                    seg.start, seg.end, i, seg.start, seg.end, i
                )
            })
            .collect();

        let concat_inputs: String = self
            .segments
            .iter()
            .enumerate()
            .flat_map(|(i, _)| vec![format!("[v{}]", i), format!("[a{}]", i)])
            .collect::<Vec<_>>()
            .join("");

        let n = self.segments.len();
        format!(
            "{};{}concat=n={}:v=1:a=1[outv][outa]",
            trim_parts.join(";"),
            concat_inputs,
            n
        )
    }

    pub fn generate_ffmpeg_command(&self, input_path: &str, output_path: &str) -> Vec<String> {
        let filter_complex = self.generate_ffmpeg_filter_complex();

        vec![
            "ffmpeg".to_string(),
            "-i".to_string(),
            input_path.to_string(),
            "-filter_complex".to_string(),
            filter_complex,
            "-map".to_string(),
            "[outv]".to_string(),
            "-map".to_string(),
            "[outa]".to_string(),
            "-y".to_string(),
            output_path.to_string(),
        ]
    }
}

#[derive(Debug, Deserialize)]
struct RawSegment {
    start: f64,
    end: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_time_segment_new_valid() {
        let seg = TimeSegment::new(1.0, 5.0).unwrap();
        assert_eq!(seg.start, 1.0);
        assert_eq!(seg.end, 5.0);
    }

    #[test]
    fn test_time_segment_new_negative_start() {
        let result = TimeSegment::new(-1.0, 5.0);
        assert!(result.is_err());
    }

    #[test]
    fn test_time_segment_new_negative_end() {
        let result = TimeSegment::new(1.0, -5.0);
        assert!(result.is_err());
    }

    #[test]
    fn test_time_segment_new_start_after_end() {
        let result = TimeSegment::new(5.0, 1.0);
        assert!(result.is_err());
    }

    #[test]
    fn test_time_segment_new_equal_times() {
        let result = TimeSegment::new(3.0, 3.0);
        assert!(result.is_err());
    }

    #[test]
    fn test_time_segment_duration() {
        let seg = TimeSegment::new(1.5, 5.5).unwrap();
        assert_eq!(seg.duration(), 4.0);
    }

    #[test]
    fn test_time_segment_ffmpeg_seek() {
        let seg = TimeSegment::new(1.234, 5.678).unwrap();
        assert_eq!(seg.to_ffmpeg_seek(), "1.234");
    }

    #[test]
    fn test_time_segment_ffmpeg_duration() {
        let seg = TimeSegment::new(1.0, 5.5).unwrap();
        assert_eq!(seg.to_ffmpeg_duration(), "4.500");
    }

    #[test]
    fn test_cut_list_parse_json_single_segment() {
        let json = r#"[{"start": 0.0, "end": 10.5}]"#;
        let cut_list = CutList::parse_json(json).unwrap();
        assert_eq!(cut_list.segments.len(), 1);
        assert_eq!(cut_list.segments[0].start, 0.0);
        assert_eq!(cut_list.segments[0].end, 10.5);
    }

    #[test]
    fn test_cut_list_parse_json_multiple_segments() {
        let json = r#"[{"start": 0.0, "end": 5.0}, {"start": 10.0, "end": 15.0}]"#;
        let cut_list = CutList::parse_json(json).unwrap();
        assert_eq!(cut_list.segments.len(), 2);
    }

    #[test]
    fn test_cut_list_parse_json_empty() {
        let json = r#"[]"#;
        let result = CutList::parse_json(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_cut_list_parse_json_invalid_json() {
        let json = r#"not valid json"#;
        let result = CutList::parse_json(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_cut_list_parse_json_invalid_segment() {
        let json = r#"[{"start": 5.0, "end": 1.0}]"#;
        let result = CutList::parse_json(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_cut_list_total_duration() {
        let json = r#"[{"start": 0.0, "end": 5.0}, {"start": 10.0, "end": 15.0}]"#;
        let cut_list = CutList::parse_json(json).unwrap();
        assert_eq!(cut_list.total_duration(), 10.0);
    }

    #[test]
    fn test_cut_list_generate_ffmpeg_command() {
        let json = r#"[{"start": 0.0, "end": 5.0}, {"start": 10.0, "end": 15.0}]"#;
        let cut_list = CutList::parse_json(json).unwrap();
        let cmd = cut_list.generate_ffmpeg_command("input.webm", "output.webm");

        assert_eq!(cmd[0], "ffmpeg");
        assert_eq!(cmd[1], "-i");
        assert_eq!(cmd[2], "input.webm");
        assert_eq!(cmd[3], "-filter_complex");
        assert!(cmd[4].contains("trim=start=0"));
        assert!(cmd[4].contains("trim=start=10"));
        assert!(cmd.contains(&"-map".to_string()));
        assert!(cmd.contains(&"[outv]".to_string()));
        assert!(cmd.contains(&"[outa]".to_string()));
        assert!(cmd.contains(&"-y".to_string()));
        assert!(cmd.contains(&"output.webm".to_string()));
    }

    #[test]
    fn test_cut_list_segments_sorted() {
        let json = r#"[{"start": 10.0, "end": 15.0}, {"start": 0.0, "end": 5.0}]"#;
        let cut_list = CutList::parse_json(json).unwrap();
        assert_eq!(cut_list.segments[0].start, 0.0);
        assert_eq!(cut_list.segments[1].start, 10.0);
    }

    #[test]
    fn test_generate_ffmpeg_filter_complex_single() {
        let json = r#"[{"start": 1.0, "end": 5.0}]"#;
        let cut_list = CutList::parse_json(json).unwrap();
        let filter = cut_list.generate_ffmpeg_filter_complex();

        assert!(filter.contains("trim=start=1:end=5"));
        assert!(filter.contains("concat=n=1"));
    }

    #[test]
    fn test_generate_ffmpeg_filter_complex_multiple() {
        let json = r#"[{"start": 0.0, "end": 5.0}, {"start": 10.0, "end": 15.0}]"#;
        let cut_list = CutList::parse_json(json).unwrap();
        let filter = cut_list.generate_ffmpeg_filter_complex();

        assert!(filter.contains("trim=start=0:end=5"));
        assert!(filter.contains("trim=start=10:end=15"));
        assert!(filter.contains("concat=n=2"));
        assert!(filter.contains("[v0]"));
        assert!(filter.contains("[v1]"));
    }
}
