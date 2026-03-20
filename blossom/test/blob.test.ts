import { describe, expect, test } from "bun:test";
import { parseBlobSha256 } from "../src/blob";

describe("parseBlobSha256", () => {
  test("accepts a bare sha256 path", () => {
    const sha256 = "a".repeat(64);
    expect(parseBlobSha256(`/${sha256}`)).toBe(sha256);
  });

  test("accepts a sha256 path with file extension", () => {
    const sha256 = "b".repeat(64);
    expect(parseBlobSha256(`/${sha256}.png`)).toBe(sha256);
  });

  test("rejects invalid blob ids", () => {
    expect(parseBlobSha256("/not-a-hash")).toBeNull();
    expect(parseBlobSha256("/list/abcd")).toBeNull();
  });
});
