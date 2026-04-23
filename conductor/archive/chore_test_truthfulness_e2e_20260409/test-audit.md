# Test Truthfulness Audit (2026-04-09)

## Scope and Method
- Enumerated every `*_test.go` file and every `func Test...` case.
- Ran structural scan for weak signal patterns: no assertions, skip-gated tests, and no-op tests.
- Manually inspected flagged tests and corrected high-impact misleading cases.
- Added runtime E2E smoke coverage for binary build + startup wiring.

## Baseline and Final Validation
- Baseline before fixes:
  - `go test ./...` passed.
  - `go build ./...` passed.
- Final after fixes:
  - `go test ./... -count=1` passed.
  - `go build ./...` passed.
  - `go test ./cmd/verbal -run TestE2E_BinaryBuildAndStartupSmoke -count=1` passed.

## High-Impact Findings and Fixes
1. `internal/ui/main_test.go` hid package failures by exiting `0` when no display was present.
   - Fix: keep running tests in headless mode and initialize GTK only when display is available.
2. `internal/media/devices_test.go` had a no-op test (`TestListVideoDevices_NoMockDevices`) that asserted nothing.
   - Fix: replaced with deterministic assertions and added fallback-path coverage for missing `wpctl`.
3. `internal/sync/integration_test.go` had a nil-player test that only checked for panic implicitly.
   - Fix: added explicit state assertions and clarified naming of word-index tracking test.
4. `internal/ui/waveformwidget_polish_test.go` had a draw-performance test that passed by doing work without assertions.
   - Fix: added coordinate round-trip invariants and non-negative coordinate assertions.
5. Missing runtime smoke coverage for real binary startup path.
   - Fix: added `--smoke-check` mode in `cmd/verbal/main.go` and E2E test in `cmd/verbal/e2e_smoke_test.go` that builds binary and executes startup check.

## Inventory Review Matrix
| Test File | Test Count | `t.Skip` Count | Review Outcome |
|---|---:|---:|---|
| `cmd/verbal/e2e_smoke_test.go` | 1 | 1 | Added in this track - runtime build/start smoke E2E |
| `internal/ai/env_test.go` | 3 | 0 | Reviewed - no change |
| `internal/ai/errors_test.go` | 7 | 0 | Reviewed - no change |
| `internal/ai/factory_test.go` | 10 | 0 | Reviewed - no change |
| `internal/ai/google_test.go` | 6 | 0 | Reviewed - no change |
| `internal/ai/integration_test.go` | 3 | 0 | Reviewed - no change |
| `internal/ai/openai_test.go` | 9 | 0 | Reviewed - no change |
| `internal/ai/provider_test.go` | 10 | 0 | Reviewed - no change |
| `internal/ai/smoke_test.go` | 3 | 2 | Reviewed - external credential smoke tests remain opt-in |
| `internal/db/repository_test.go` | 15 | 0 | Reviewed - no change |
| `internal/db/service_test.go` | 9 | 0 | Reviewed - no change |
| `internal/db/settings_repository_test.go` | 10 | 0 | Reviewed - no change |
| `internal/db/thumbnail_repository_test.go` | 4 | 0 | Reviewed - no change |
| `internal/media/devices_test.go` | 6 | 0 | Fixed - replaced no-op test and added fallback assertions |
| `internal/media/export_test.go` | 5 | 0 | Reviewed - no change |
| `internal/media/playback_test.go` | 8 | 0 | Reviewed - no change |
| `internal/media/position_monitor_test.go` | 10 | 0 | Reviewed - no change |
| `internal/media/types_test.go` | 1 | 0 | Reviewed - no change |
| `internal/settings/integration_test.go` | 4 | 0 | Reviewed - no change |
| `internal/settings/provider_test.go` | 13 | 0 | Reviewed - no change |
| `internal/settings/service_test.go` | 12 | 0 | Reviewed - no change |
| `internal/sync/controller_test.go` | 16 | 0 | Reviewed - no change |
| `internal/sync/integration_test.go` | 9 | 0 | Fixed - strengthened nil-player assertions and renamed misleading test |
| `internal/thumbnail/generator_test.go` | 4 | 0 | Reviewed - no change |
| `internal/thumbnail/gstreamer_extractor_test.go` | 5 | 0 | Reviewed - no change |
| `internal/thumbnail/service_test.go` | 4 | 0 | Reviewed - no change |
| `internal/transcription/service_test.go` | 10 | 0 | Reviewed - no change |
| `internal/ui/editabletranscriptionview_test.go` | 9 | 9 | Reviewed - display-gated by design |
| `internal/ui/libraryview_test.go` | 11 | 0 | Reviewed - no change |
| `internal/ui/main_test.go` | 1 | 0 | Fixed - removed package-level false-pass bypass |
| `internal/ui/playbackwindow_test.go` | 15 | 14 | Reviewed - display-gated by design |
| `internal/ui/providerconfigpanel_test.go` | 10 | 10 | Reviewed - display-gated by design |
| `internal/ui/recordinglistitem_test.go` | 7 | 0 | Reviewed - no change |
| `internal/ui/recordingloader_test.go` | 9 | 0 | Reviewed - no change |
| `internal/ui/settingswindow_test.go` | 8 | 8 | Reviewed - display-gated by design |
| `internal/ui/thumbnailwidget_test.go` | 5 | 0 | Reviewed - no change |
| `internal/ui/waveformwidget_advanced_test.go` | 5 | 0 | Reviewed - no change |
| `internal/ui/waveformwidget_polish_test.go` | 5 | 0 | Fixed - added real assertions to draw/performance test |
| `internal/ui/waveformwidget_test.go` | 6 | 0 | Reviewed - no change |
| `internal/ui/word_label_test.go` | 7 | 6 | Reviewed - display-gated by design |
| `internal/waveform/cache_test.go` | 10 | 1 | Reviewed - no change |
| `internal/waveform/generator_test.go` | 5 | 2 | Reviewed - no change |

## Aggregate Counts
- Test files reviewed: 42
- Test functions reviewed: 310
- `t.Skip` call sites: 53

## Residual Risk
- Display-dependent UI tests remain intentionally gated and still require display-backed execution to validate fully.
- Cloud-provider smoke tests (`internal/ai/smoke_test.go`) remain opt-in by API key and are not part of deterministic local CI gates.
