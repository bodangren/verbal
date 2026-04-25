# Filler Word Detection - Specification

## Overview

Implement detection and flagging of filler words in transcription data. Filler words are non-essential words that don't add meaning (um, uh, like, you know, actually, basically, so, etc.) and are candidates for removal during editorial review.

## Domain Model

### FillerWord Types
- **Short fillers**: "um", "uh", "hm", "mm", "ah", "er"
- **Hesitation patterns**: "like", "you know", "I mean", "sort of", "kind of", "basically", "actually", "so...", "right?"
- **Repetition patterns**: words repeated within short time windows (e.g., "the the", "I I")

### Detection Approach
Use a configurable detection engine that:
1. Checks each word against a known filler word list
2. Detects repetition patterns (same word within 2-second window)
3. Allows custom patterns via configuration

## Acceptance Criteria

1. **FillerWord struct** - New struct with Text, Start, End, Type fields
2. **Detector interface** - `Detect(words []ai.Word) []*FillerWord`
3. **Built-in patterns** - Common English filler words covered
4. **Repetition detection** - Flag repeated words within time window
5. **Configurable sensitivity** - Allow enabling/disabling detection types
6. **No modification of original data** - Detection only, never mutates source
7. **Tests pass** - Unit tests for all detection patterns
8. **Build succeeds** - `make go-build` passes