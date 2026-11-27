// @vitest-environment node
import { describe, expect, it } from "vitest";
import { config } from "../pages/api/takes";
import { MAX_UPLOAD_BODY_BYTES } from "./take-api";

describe("take upload route config", () => {
  it("raises the vinext body parser limit to the take upload limit", () => {
    expect(config).toEqual({ api: { bodyParser: { sizeLimit: MAX_UPLOAD_BODY_BYTES } } });
  });

  it("allows a 3 MB upload to pass the parser limit", () => {
    const limit = config.api.bodyParser.sizeLimit;
    expect(limit).toBeGreaterThan(3 * 1024 * 1024);
  });
});
