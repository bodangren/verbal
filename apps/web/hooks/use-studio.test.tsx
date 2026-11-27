// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@verbal/core/browser";
import { useStudio, type StudioController, type StudioDeps } from "./use-studio";

const api = vi.hoisted(() => ({
  listTakes: vi.fn(),
  uploadTake: vi.fn(),
  getProject: vi.fn(),
  startTakeTranscript: vi.fn(),
  getTakeTranscript: vi.fn(),
  previewTakeReview: vi.fn(),
  runTakeReview: vi.fn(),
  buildCut: vi.fn(),
  renderCut: vi.fn(),
}));

vi.mock("../lib/api-client", () => api);

function doneJob(id: string): JobRecord {
  return {
    id,
    kind: "capture",
    status: "done",
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
    progress: 1,
    message: null,
    result: null,
    error: null,
  };
}

const takeFixture = {
  id: "take-1",
  fileName: "take-1.mp4",
  createdAt: "2026-11-27T00:00:00.000Z",
  durationSeconds: 3,
};

const projectFixture = {
  schemaVersion: 1,
  id: "p1",
  name: "Demo",
  createdAt: "2026-11-27T00:00:00.000Z",
};

function makeDeps(overrides: Partial<StudioDeps> = {}): StudioDeps {
  return {
    open: false,
    root: "/p",
    script: "Hello world.",
    projectName: "Demo",
    words: 2,
    readTime: "0:01",
    reducedMotion: false,
    cameraAvailable: false,
    mode: "ingest",
    paneError: null,
    resetPrompterRef: { current: () => undefined },
    onClose: vi.fn(),
    onScriptChange: vi.fn(),
    onUseTranscript: vi.fn(),
    onDismissError: vi.fn(),
    setMessage: vi.fn(),
    setJob: vi.fn(),
    setProject: vi.fn(),
    pollJob: vi.fn(async () => doneJob("job-1")),
    guard: vi.fn(async (run: () => Promise<void>) => {
      await run();
    }),
    ...overrides,
  };
}

beforeEach(() => {
  cleanup();
  for (const fn of Object.values(api)) {
    fn.mockReset();
  }
  api.listTakes.mockResolvedValue({ takes: [] });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useStudio", () => {
  it("loads the take list when the project root changes", async () => {
    api.listTakes.mockResolvedValue({ takes: [takeFixture] });

    const { result } = renderHook(() => useStudio(makeDeps()));

    await waitFor(() => expect(api.listTakes).toHaveBeenCalledWith("/p"));
    await waitFor(() => expect(result.current.capture.takes).toEqual([takeFixture]));
  });

  it("falls back to an empty take list when the fetch fails", async () => {
    api.listTakes.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useStudio(makeDeps()));

    await waitFor(() => expect(result.current.capture.takes).toEqual([]));
  });

  it("closes: calls onClose and stops the prompter", () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useStudio(deps));

    act(() => result.current.onTogglePlay());
    expect(result.current.prompter.playing).toBe(true);

    act(() => result.current.close());
    expect(deps.onClose).toHaveBeenCalledTimes(1);
    expect(result.current.prompter.playing).toBe(false);
  });

  it("drives the prompter controls", () => {
    const { result } = renderHook(() => useStudio(makeDeps()));

    act(() => result.current.onWpmChange(200));
    expect(result.current.prompter.wpm).toBe(200);

    act(() => result.current.onToggleMirror());
    expect(result.current.prompter.mirror).toBe(true);

    act(() => result.current.onFontSizeChange(60));
    expect(result.current.prompter.fontSize).toBe(60);

    act(() => result.current.onReset());
    expect(result.current.prompter.offsetWords).toBe(0);
  });

  it("exposes the reset handle Home calls on a script change", () => {
    const reset = { current: () => undefined };
    const deps = makeDeps({ resetPrompterRef: reset });
    const { result } = renderHook(() => useStudio(deps));

    act(() => result.current.onTogglePlay());
    expect(result.current.prompter.playing).toBe(true);

    act(() => reset.current());
    expect(result.current.prompter.playing).toBe(false);
    expect(result.current.prompter.offsetWords).toBe(0);
  });

  it("records and uploads a take", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [] } as unknown as MediaStream)),
        enumerateDevices: vi.fn(async () => []),
      },
    });

    class FakeMediaRecorder {
      static isTypeSupported(): boolean {
        return true;
      }
      state = "inactive";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start(): void {
        this.state = "recording";
      }
      stop(): void {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["take"]) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    api.uploadTake.mockResolvedValue(doneJob("job-1"));
    api.listTakes.mockResolvedValue({ takes: [takeFixture] });
    api.getProject.mockResolvedValue(projectFixture);

    const deps = makeDeps();
    const { result } = renderHook(() => useStudio(deps));

    act(() => result.current.capture.onStart());
    await waitFor(() => expect(result.current.capture.state).toBe("recording"), {
      timeout: 5000,
    });

    act(() => result.current.capture.onStop());
    await waitFor(() => expect(api.uploadTake).toHaveBeenCalled(), { timeout: 5000 });
    await waitFor(() => expect(result.current.capture.takes).toEqual([takeFixture]));

    expect(api.listTakes).toHaveBeenCalledWith("/p");
    expect(api.getProject).toHaveBeenCalledWith("/p");
    expect(deps.setProject).toHaveBeenCalledWith(projectFixture);
    expect(deps.setMessage).toHaveBeenCalledWith("Take saved");
    expect(deps.setJob).toHaveBeenCalled();
    expect(result.current.capture.state).toBe("idle");
  });

  async function openReview(result: { current: StudioController }) {
    api.startTakeTranscript.mockResolvedValue(doneJob("job-1"));
    api.getTakeTranscript.mockResolvedValue({ words: [] });

    await act(async () => {
      result.current.onReview("take-1");
    });
    await waitFor(() => expect(result.current.review?.takeId).toBe("take-1"));
  }

  it("renderCut sets rendering true, then false once, on success", async () => {
    let resolveRender!: (job: JobRecord) => void;
    api.renderCut.mockReturnValue(
      new Promise<JobRecord>((resolve) => {
        resolveRender = resolve;
      }),
    );
    api.getProject.mockResolvedValue(projectFixture);

    const deps = makeDeps();
    const { result } = renderHook(() => useStudio(deps));
    await openReview(result);

    act(() => {
      result.current.onRenderCut();
    });
    expect(result.current.rendering).toBe(true);

    await act(async () => {
      resolveRender(doneJob("job-1"));
    });
    await waitFor(() => expect(result.current.rendering).toBe(false));
    expect(deps.setMessage).toHaveBeenCalledWith("Cut rendered");
  });

  it("renderCut resets rendering once when the render fails", async () => {
    api.renderCut.mockRejectedValue(new Error("render failed"));
    api.getProject.mockResolvedValue(projectFixture);

    const deps = makeDeps({
      guard: async (run: () => Promise<void>) => {
        try {
          await run();
        } catch {
          // The page turns this into a pane error; the hook must still reset.
        }
      },
    });
    const { result } = renderHook(() => useStudio(deps));
    await openReview(result);

    await act(async () => {
      result.current.onRenderCut();
    });
    await waitFor(() => expect(result.current.rendering).toBe(false));
  });
});
