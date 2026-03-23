use crate::ai::{TextGenerationRequest, WordTimestamp};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FillerSegment {
    pub word: String,
    pub start: f64,
    pub end: f64,
    pub filler_type: FillerType,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FillerType {
    Pause,
    FillerWord,
    Hedge,
    Repetition,
}

impl std::fmt::Display for FillerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FillerType::Pause => write!(f, "pause"),
            FillerType::FillerWord => write!(f, "filler_word"),
            FillerType::Hedge => write!(f, "hedge"),
            FillerType::Repetition => write!(f, "repetition"),
        }
    }
}

const FILLER_DETECTION_PROMPT: &str = r#"You are a transcript editor. Identify filler words and disfluencies in the transcript.

For each filler word, return a JSON object with:
- "index": the word index in the transcript (0-based)
- "type": one of "filler_word", "pause", "hedge", or "repetition"

Filler words: um, uh, ah, er, hmm, like, you know, so, basically, actually, literally, right, I mean

Return a JSON array. If no fillers found, return [].

Example: [{"index": 5, "type": "filler_word"}, {"index": 12, "type": "hedge"}]

Transcript:""#;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FillerDetection {
    index: usize,
    #[serde(rename = "type")]
    filler_type: String,
}

pub struct FillerDetector;

impl FillerDetector {
    pub fn new() -> Self {
        Self
    }

    pub fn build_prompt(transcript: &str) -> TextGenerationRequest {
        TextGenerationRequest {
            prompt: format!("{}\n\n{}", FILLER_DETECTION_PROMPT, transcript),
            system_prompt: Some(
                "You are a precise transcript analyzer. Return only valid JSON arrays.".to_string(),
            ),
            max_tokens: Some(2000),
        }
    }

    pub fn parse_response(response_text: &str, words: &[WordTimestamp]) -> Vec<FillerSegment> {
        let detections: Vec<FillerDetection> = match serde_json::from_str(response_text) {
            Ok(d) => d,
            Err(_) => return vec![],
        };

        detections
            .into_iter()
            .filter_map(|d| {
                let word_ts = words.get(d.index)?;
                let filler_type = match d.filler_type.as_str() {
                    "filler_word" => FillerType::FillerWord,
                    "pause" => FillerType::Pause,
                    "hedge" => FillerType::Hedge,
                    "repetition" => FillerType::Repetition,
                    _ => FillerType::FillerWord,
                };

                Some(FillerSegment {
                    word: word_ts.word.clone(),
                    start: word_ts.start,
                    end: word_ts.end,
                    filler_type,
                })
            })
            .collect()
    }
}

impl Default for FillerDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filler_type_display() {
        assert_eq!(FillerType::Pause.to_string(), "pause");
        assert_eq!(FillerType::FillerWord.to_string(), "filler_word");
        assert_eq!(FillerType::Hedge.to_string(), "hedge");
        assert_eq!(FillerType::Repetition.to_string(), "repetition");
    }

    #[test]
    fn test_filler_type_serialization() {
        let ft = FillerType::FillerWord;
        let json = serde_json::to_string(&ft).unwrap();
        assert_eq!(json, "\"filler_word\"");

        let parsed: FillerType = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, FillerType::FillerWord);
    }

    #[test]
    fn test_filler_segment_serialization() {
        let segment = FillerSegment {
            word: "um".to_string(),
            start: 1.5,
            end: 2.0,
            filler_type: FillerType::FillerWord,
        };

        let json = serde_json::to_string(&segment).unwrap();
        assert!(json.contains("\"um\""));
        assert!(json.contains("1.5"));
        assert!(json.contains("filler_word"));
    }

    #[test]
    fn test_build_prompt_contains_transcript() {
        let request = FillerDetector::build_prompt("Hello world");
        assert!(request.prompt.contains("Hello world"));
        assert!(request.system_prompt.is_some());
        assert_eq!(request.max_tokens, Some(2000));
    }

    #[test]
    fn test_parse_response_empty() {
        let words = vec![
            WordTimestamp {
                word: "Hello".to_string(),
                start: 0.0,
                end: 0.5,
            },
            WordTimestamp {
                word: "world".to_string(),
                start: 0.5,
                end: 1.0,
            },
        ];

        let result = FillerDetector::parse_response("[]", &words);
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_response_single_filler() {
        let words = vec![
            WordTimestamp {
                word: "Hello".to_string(),
                start: 0.0,
                end: 0.5,
            },
            WordTimestamp {
                word: "um".to_string(),
                start: 0.5,
                end: 1.0,
            },
            WordTimestamp {
                word: "world".to_string(),
                start: 1.0,
                end: 1.5,
            },
        ];

        let result =
            FillerDetector::parse_response(r#"[{"index": 1, "type": "filler_word"}]"#, &words);

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].word, "um");
        assert_eq!(result[0].filler_type, FillerType::FillerWord);
        assert!((result[0].start - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_parse_response_multiple_fillers() {
        let words = vec![
            WordTimestamp {
                word: "So".to_string(),
                start: 0.0,
                end: 0.3,
            },
            WordTimestamp {
                word: "um".to_string(),
                start: 0.3,
                end: 0.8,
            },
            WordTimestamp {
                word: "I".to_string(),
                start: 0.8,
                end: 1.0,
            },
            WordTimestamp {
                word: "basically".to_string(),
                start: 1.0,
                end: 1.5,
            },
            WordTimestamp {
                word: "think".to_string(),
                start: 1.5,
                end: 2.0,
            },
        ];

        let result = FillerDetector::parse_response(
            r#"[{"index": 1, "type": "filler_word"}, {"index": 3, "type": "hedge"}]"#,
            &words,
        );

        assert_eq!(result.len(), 2);
        assert_eq!(result[0].word, "um");
        assert_eq!(result[0].filler_type, FillerType::FillerWord);
        assert_eq!(result[1].word, "basically");
        assert_eq!(result[1].filler_type, FillerType::Hedge);
    }

    #[test]
    fn test_parse_response_invalid_json() {
        let words = vec![WordTimestamp {
            word: "Hello".to_string(),
            start: 0.0,
            end: 0.5,
        }];

        let result = FillerDetector::parse_response("not json", &words);
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_response_index_out_of_bounds() {
        let words = vec![WordTimestamp {
            word: "Hello".to_string(),
            start: 0.0,
            end: 0.5,
        }];

        let result =
            FillerDetector::parse_response(r#"[{"index": 10, "type": "filler_word"}]"#, &words);

        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_response_unknown_type_defaults_to_filler_word() {
        let words = vec![WordTimestamp {
            word: "test".to_string(),
            start: 0.0,
            end: 0.5,
        }];

        let result =
            FillerDetector::parse_response(r#"[{"index": 0, "type": "unknown_type"}]"#, &words);

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].filler_type, FillerType::FillerWord);
    }
}
