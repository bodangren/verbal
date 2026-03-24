# Implementation Plan: Fix Critical Bugs Found in Code Review

---

## Phase 1: Fix Recording Save (empty Blob + JSON bloat)

These two bugs are in the recording pipeline. Fix them together.

---

### Task 1.1: Fix `stopRecording` returning empty Blob

**The problem:** When you click "Stop Recording", the app creates a Blob from
`recordedChunks` (React state). But React state updates are async — the chunks
from `ondataavailable` haven't been written to state yet when we read it.
It's like trying to read a file before it's finished writing.

**File to edit:** `src/hooks/useWebcam.ts`

**Step-by-step:**

1. Open `src/hooks/useWebcam.ts`
2. Add a new ref near the top of the hook (around line 19, next to `mediaRecorderRef`):
   ```typescript
   const chunksRef = useRef<Blob[]>([]);
   ```
3. In `startRecording` (around line 42), replace the current chunk handling:

   **FIND this code:**
   ```typescript
   const chunks: Blob[] = [];
   const mediaRecorder = new MediaRecorder(stream);

   mediaRecorder.ondataavailable = (event) => {
     if (event.data.size > 0) {
       chunks.push(event.data);
       setRecordedChunks([...chunks]);
     }
   };
   ```

   **REPLACE with:**
   ```typescript
   chunksRef.current = [];  // reset for new recording
   const mediaRecorder = new MediaRecorder(stream);

   mediaRecorder.ondataavailable = (event) => {
     if (event.data.size > 0) {
       chunksRef.current.push(event.data);
       setRecordedChunks([...chunksRef.current]);  // keep state in sync for UI
     }
   };
   ```

4. In `stopRecording` (around line 56), change how the Blob is created:

   **FIND this code:**
   ```typescript
   const blob = new Blob(recordedChunks, { type: "video/webm" });
   ```

   **REPLACE with:**
   ```typescript
   const blob = new Blob(chunksRef.current, { type: "video/webm" });
   ```

   This reads directly from the ref (synchronous, always current) instead of
   React state (async, may be stale).

5. **Update the test** in `src/hooks/useWebcam.test.ts`:
   - The existing test "should stop recording and return recorded chunks" should
     still pass. Run `npm test` to verify.
   - Add a new test that verifies the Blob is non-empty after recording data:
   ```typescript
   it("should return blob with recorded data after ondataavailable", async () => {
     const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
     mockGetUserMedia.mockResolvedValue(mockStream);

     const mockRecorderInstance = {
       start: vi.fn(),
       stop: vi.fn(),
       ondataavailable: null as ((event: { data: Blob }) => void) | null,
       onstop: null as (() => void) | null,
       state: "recording" as const,
     };
     mockMediaRecorder.mockImplementation(() => mockRecorderInstance);

     const { result } = renderHook(() => useWebcam());

     await act(async () => {
       await result.current.startCamera();
     });

     act(() => {
       result.current.startRecording();
     });

     // Simulate data arriving
     act(() => {
       if (mockRecorderInstance.ondataavailable) {
         mockRecorderInstance.ondataavailable({ data: new Blob(["chunk1"]) });
         mockRecorderInstance.ondataavailable({ data: new Blob(["chunk2"]) });
       }
     });

     let blob: Blob | null = null;
     act(() => {
       blob = result.current.stopRecording();
     });

     // The blob should contain the data we pushed, not be empty
     expect(blob).toBeInstanceOf(Blob);
     expect(blob!.size).toBeGreaterThan(0);
   });
   ```

- [x] Write Tests: Add test verifying Blob is non-empty after ondataavailable events
- [x] Implement Feature: Use chunksRef instead of state for chunk accumulation
- [x] Verify: Run `npm test` — all tests pass

---

### Task 1.2: Fix `saveVideoRecording` JSON bloat

**The problem:** A 50MB video gets converted to a JSON array like `[72,101,108,...]`
which is 200MB+. This is because `Array.from(new Uint8Array(buffer))` turns every
byte into a JSON number.

**File to edit:** `src/api/video.ts` and `src-tauri/src/commands/mod.rs`

**Step-by-step:**

1. First, add the `base64` crate to Rust. Open `src-tauri/Cargo.toml` and add:
   ```toml
   base64 = "0.22"
   ```

2. Edit `src/api/video.ts`. Change the `saveVideoRecording` function:

   **FIND this code:**
   ```typescript
   const buffer = await blob.arrayBuffer();
   const data = Array.from(new Uint8Array(buffer));
   ```

   **REPLACE with:**
   ```typescript
   const buffer = await blob.arrayBuffer();
   const bytes = new Uint8Array(buffer);
   // Convert to base64 — much smaller than JSON number array
   let binary = "";
   for (let i = 0; i < bytes.length; i++) {
     binary += String.fromCharCode(bytes[i]);
   }
   const data = btoa(binary);
   ```

3. Edit `src-tauri/src/commands/mod.rs`. Change the `save_video` function signature
   and body:

   **FIND this code:**
   ```rust
   pub async fn save_video(
       app: AppHandle,
       filename: String,
       data: Vec<u8>,
   ) -> Result<String> {
   ```

   **REPLACE with:**
   ```rust
   pub async fn save_video(
       app: AppHandle,
       filename: String,
       data: String,  // <-- now base64 string, not Vec<u8>
   ) -> Result<String> {
   ```

4. In the same function, add base64 decoding before the write. After the path
   traversal check, **FIND:**
   ```rust
   std::fs::write(&canonical, data)?;
   ```

   **REPLACE with:**
   ```rust
   use base64::Engine;
   let bytes = base64::engine::general_purpose::STANDARD
       .decode(&data)
       .map_err(|e| crate::error::VerbalError::MediaProcessing(
           format!("Invalid base64 data: {}", e)
       ))?;
   tokio::fs::write(&canonical, bytes).await?;
   ```

   Note: this also fixes the sync `std::fs::write` issue — we're using
   `tokio::fs::write` now which won't block the async runtime.

5. Run `cargo test` in `src-tauri/` to make sure Rust tests pass.
6. Run `npm test` to make sure frontend tests pass.

- [x] Write Tests: Verify base64 round-trip in Rust unit test
- [x] Implement Feature: Change data transfer from JSON array to base64
- [x] Implement Feature: Switch from `std::fs::write` to `tokio::fs::write`
- [x] Verify: `cargo test` and `npm test` both pass

---

## Phase 2: Fix `apply_cuts` (path validation crash)

---

### Task 2.1: Fix `validate_path_is_within_dir` for non-existent files

**The problem:** `apply_cuts` calls `validate_path_is_within_dir(output_path, app_dir)`.
That function uses `dunce::canonicalize(output_path)` which REQUIRES the file to
already exist. The output file doesn't exist yet (FFmpeg will create it), so this
always returns an error.

**File to edit:** `src-tauri/src/ffmpeg/mod.rs`

**Step-by-step:**

1. Open `src-tauri/src/ffmpeg/mod.rs`
2. Find the `validate_path_is_within_dir` function (near the bottom, around line 85)

   **REPLACE the entire function with:**
   ```rust
   pub fn validate_path_is_within_dir(path: &Path, dir: &Path) -> Result<()> {
       let canonical_dir = dunce::canonicalize(dir)
           .map_err(|e| VerbalError::MediaProcessing(format!("Invalid directory: {}", e)))?;

       // For files that don't exist yet, canonicalize the parent directory
       // and append the filename
       let canonical_path = if path.exists() {
           dunce::canonicalize(path)
               .map_err(|e| VerbalError::MediaProcessing(format!("Invalid path: {}", e)))?
       } else {
           let parent = path
               .parent()
               .ok_or_else(|| VerbalError::MediaProcessing("Path has no parent directory".to_string()))?;
           let filename = path
               .file_name()
               .ok_or_else(|| VerbalError::MediaProcessing("Path has no filename".to_string()))?;
           let canonical_parent = dunce::canonicalize(parent)
               .map_err(|e| VerbalError::MediaProcessing(format!("Invalid parent path: {}", e)))?;
           canonical_parent.join(filename)
       };

       if !canonical_path.starts_with(&canonical_dir) {
           return Err(VerbalError::MediaProcessing(
               "Path traversal detected: path is outside allowed directory".to_string(),
           ));
       }

       Ok(())
   }
   ```

3. Update the existing tests for this function. The `test_validate_path_nonexistent`
   test currently expects an error for ANY non-existent path — now it should only
   error if the *parent* doesn't exist or the path is outside the dir.

   **FIND the test:**
   ```rust
   #[test]
   fn test_validate_path_nonexistent() {
       let result =
           validate_path_is_within_dir(Path::new("/nonexistent/path.webm"), Path::new("/tmp"));
       assert!(result.is_err());
   }
   ```

   **REPLACE with:**
   ```rust
   #[test]
   fn test_validate_path_nonexistent_parent() {
       // Parent directory doesn't exist — should error
       let result =
           validate_path_is_within_dir(Path::new("/nonexistent/path.webm"), Path::new("/tmp"));
       assert!(result.is_err());
   }

   #[test]
   fn test_validate_path_nonexistent_file_valid_parent() {
       // File doesn't exist but parent does — should be OK if within dir
       let dir = tempdir().unwrap();
       let new_file = dir.path().join("new_output.webm");
       let result = validate_path_is_within_dir(&new_file, dir.path());
       assert!(result.is_ok());
   }
   ```

4. Add `use tempfile::tempdir;` to the test imports if not already there.

### Task 2.2: Add input_path validation to `apply_cuts`

**File to edit:** `src-tauri/src/commands/mod.rs`

**Step-by-step:**

1. In the `apply_cuts` function, find the line:
   ```rust
   validate_path_is_within_dir(&output_path, &app_dir)?;
   ```

2. Add input validation BEFORE it:
   ```rust
   validate_path_is_within_dir(&input_path, &app_dir)?;
   validate_path_is_within_dir(&output_path, &app_dir)?;
   ```

- [x] Write Tests: Test non-existent output path passes, non-existent parent fails
- [x] Implement Feature: Fix validate_path_is_within_dir to handle non-existent files
- [x] Implement Feature: Add input_path validation to apply_cuts
- [x] Verify: `cargo test` passes

---

## Phase 3: Fix async transcription job status

---

### Task 3.1: Update job status to Failed on all error paths

**The problem:** When `start_transcription` spawns a background task, if anything
goes wrong (provider not configured, provider changed, etc.), the task silently
exits. The job stays "Pending" forever. The user never sees an error.

**File to edit:** `src-tauri/src/commands/transcription.rs`

**Step-by-step:**

1. Open `src-tauri/src/commands/transcription.rs`
2. Find the `tokio::spawn(async move { ... })` block in `start_transcription`
3. The current code looks roughly like this:
   ```rust
   tokio::spawn(async move {
       let ai_guard = ai_state_clone.read().await;
       if let Some(holder) = ai_guard.as_ref() {
           if holder.provider == provider_type {
               if let Ok(provider) = holder.get_provider() {
                   let result = orchestrator.read().await.execute(&job_id_clone, provider).await;
                   match result {
                       Ok(res) => { tracing::info!(...); }
                       Err(e) => { tracing::error!(...); }
                   }
               }
           }
       }
   });
   ```

   The problem: every `if let` / `if` that fails just falls through silently.

4. **REPLACE the entire `tokio::spawn(...)` block with:**
   ```rust
   tokio::spawn(async move {
       // Helper closure so we can use ? for early returns
       let run = async {
           let ai_guard = ai_state_clone.read().await;
           let holder = ai_guard.as_ref()
               .ok_or_else(|| "No AI provider configured".to_string())?;

           if holder.provider != provider_type {
               return Err(format!(
                   "Provider changed from {:?} to {:?} after job was created",
                   provider_type, holder.provider
               ));
           }

           let provider = holder.get_provider()
               .map_err(|e| format!("Failed to get provider: {}", e))?;

           orchestrator.read().await
               .execute(&job_id_clone, provider).await
               .map_err(|e| format!("Transcription failed: {}", e))?;

           Ok::<(), String>(())
       };

       if let Err(e) = run.await {
           tracing::error!("Transcription job {} failed: {}", job_id_clone, e);
           // Mark the job as failed so the frontend knows
           let orch_guard = orchestrator.read().await;
           let mut tracker = orch_guard.tracker().write().await;
           tracker.fail(&job_id_clone, e);
       }
   });
   ```

5. You'll need a `fail` method on `JobTracker`. Open
   `src-tauri/src/transcription/jobs.rs` and add this method to `JobTracker`:
   ```rust
   pub fn fail(&mut self, job_id: &str, error_message: String) {
       if let Some(job) = self.jobs.get_mut(job_id) {
           job.status = JobStatus::Failed;
           job.error = Some(error_message);
       }
   }
   ```

   Check if `TranscriptionJob` already has an `error` field. If not, add one:
   ```rust
   pub struct TranscriptionJob {
       // ... existing fields ...
       pub error: Option<String>,  // add this if missing
   }
   ```
   And initialize it to `None` in the constructor.

6. Add a test:
   ```rust
   #[test]
   fn test_job_tracker_fail() {
       let mut tracker = JobTracker::new();
       let job = TranscriptionJob::new("test-1".to_string(), "/some/path.mp4".to_string());
       tracker.add(job);

       tracker.fail("test-1", "Provider not configured".to_string());

       let job = tracker.get("test-1").unwrap();
       assert_eq!(job.status, JobStatus::Failed);
       assert_eq!(job.error.as_deref(), Some("Provider not configured"));
   }
   ```

- [x] Write Tests: Test that fail() updates job status and error message
- [x] Implement Feature: Add fail() method to JobTracker
- [x] Implement Feature: Rewrite tokio::spawn block to catch all errors and call fail()
- [x] Verify: `cargo test` passes

---

## Phase 4: Final Verification

- [x] Run `npm test` — all frontend tests pass
- [x] Run `cargo test` in `src-tauri/` — all Rust tests pass
- [ ] Manual test: Start the app with `cargo tauri dev`, record a short video, stop, verify the file is saved and playable
- [ ] Review: Check tech-debt.md and mark fixed items as resolved
