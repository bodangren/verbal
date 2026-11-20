import { describe, expect, it } from "vitest";
import { buildThumbnailArgs, THUMBNAIL_WIDTH } from "./thumbnail";

describe("buildThumbnailArgs", () => {
  it("seeks, takes one frame, scales, and writes an image", () => {
    const args = buildThumbnailArgs("/media/take.mp4", "/tmp/thumb.jpg", 2.5);

    expect(args).toContain("-ss");
    expect(args[args.indexOf("-ss") + 1]).toBe("2.5");
    expect(args).toContain("-frames:v");
    expect(args[args.indexOf("-frames:v") + 1]).toBe("1");
    expect(args).toContain("scale=320:-2");
    expect(args.at(-1)).toBe("/tmp/thumb.jpg");
    expect(args[args.indexOf("-i") + 1]).toBe("/media/take.mp4");
    expect(THUMBNAIL_WIDTH).toBe(320);
  });

  it("passes paths as separate argv entries, never a shell string", () => {
    const args = buildThumbnailArgs("/media/with space & $(curl evil).mp4", "/tmp/out.jpg");

    expect(args).toContain("/media/with space & $(curl evil).mp4");
    expect(args.join(" ")).toContain("$(curl evil)"); // present as data, not interpreted
  });

  it("clamps a negative seek to zero", () => {
    const args = buildThumbnailArgs("/media/take.mp4", "/tmp/out.jpg", -3);

    expect(args[args.indexOf("-ss") + 1]).toBe("0");
  });
});
