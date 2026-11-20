import { describe, expect, it } from "vitest";
import { buildCaptureArgs, CaptureError, type CaptureRequest } from "./capture";

function request(overrides: Partial<CaptureRequest> = {}): CaptureRequest {
  return { outputPath: "/out/capture.mp4", durationSeconds: 10, ...overrides };
}

describe("buildCaptureArgs", () => {
  it("captures from v4l2 and pulse by default", () => {
    const args = buildCaptureArgs(request());
    const joined = args.join(" ");

    expect(joined).toContain("-f v4l2");
    expect(joined).toContain("-i /dev/video0");
    expect(joined).toContain("-f pulse");
    expect(joined).toContain("-i default");
    expect(args.at(-1)).toBe("/out/capture.mp4");
  });

  it("limits the recording to the requested duration", () => {
    const args = buildCaptureArgs(request({ durationSeconds: 12.5 }));

    expect(args[args.indexOf("-t") + 1]).toBe("12.500");
  });

  it("places size and frame-rate options before the video input", () => {
    const args = buildCaptureArgs(
      request({ fps: 30, size: { width: 1920, height: 1080 } }),
    );

    const input = args.indexOf("-i");
    expect(args.indexOf("-video_size")).toBeLessThan(input);
    expect(args.indexOf("-framerate")).toBeLessThan(input);
    expect(args[args.indexOf("-video_size") + 1]).toBe("1920x1080");
  });

  it("honours custom devices", () => {
    const args = buildCaptureArgs(
      request({ videoDevice: "/dev/video2", audioDevice: "alsa_input.usb" }),
    );

    expect(args).toContain("/dev/video2");
    expect(args).toContain("alsa_input.usb");
  });

  it("keeps a hostile output path in argv, not in an option value", () => {
    const hostile = '/tmp/"; rm -rf / #.mp4';
    const args = buildCaptureArgs(request({ outputPath: hostile }));

    expect(args).toContain(hostile);
    expect(args.at(-1)).toBe(hostile);
  });

  it("is deterministic", () => {
    expect(buildCaptureArgs(request())).toEqual(buildCaptureArgs(request()));
  });

  it("rejects a non-positive duration", () => {
    expect(() => buildCaptureArgs(request({ durationSeconds: 0 }))).toThrow(CaptureError);
  });

  it("rejects an empty output path", () => {
    expect(() => buildCaptureArgs(request({ outputPath: "" }))).toThrow(CaptureError);
  });
});
