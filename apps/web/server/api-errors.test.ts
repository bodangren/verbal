import { describe, expect, it } from "vitest";
import { BrandError } from "@verbal/compose";
import { failure } from "./api-errors";
import { PayloadTooLargeError } from "./http";

describe("failure", () => {
  it("maps a payload too large error to 413 with its message", () => {
    const error = new PayloadTooLargeError(10);

    expect(failure(error)).toEqual({
      status: 413,
      body: { error: "request body exceeds 10 bytes" },
    });
  });

  it("maps a brand kit error to 400", () => {
    expect(failure(new BrandError("title is required")).status).toBe(400);
  });

  it("keeps an unknown error at 500", () => {
    expect(failure(new Error("boom")).status).toBe(500);
  });
});
