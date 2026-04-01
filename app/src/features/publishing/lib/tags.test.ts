import { describe, expect, it } from "vitest";

import fixtures from "@/shared/lib/tag-fixtures.json";

import {
  normalizePublishTag,
  normalizePublishTags,
} from "@/features/publishing/lib/tags";

describe("normalizePublishTag", () => {
  it("follows the shared publish fixture corpus", () => {
    for (const testCase of fixtures.publishCases) {
      expect(normalizePublishTag(testCase.raw)).toBe(testCase.canonical);
    }
  });
});

describe("normalizePublishTags", () => {
  it("dedupes and filters invalid tags", () => {
    expect(
      normalizePublishTags(["#Roadmap", "roadmap", "#Project Alpha#", "123"]),
    ).toEqual(["roadmap"]);
  });
});
