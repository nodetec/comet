import { describe, expect, it } from "vitest";

import fixtures from "@/shared/lib/tag-fixtures.json";

import {
  canonicalizeTagPartial,
  canonicalizeTagPath,
  findTagEntityMatch,
  matchTagCompletionAtEnd,
  renderTagToken,
} from "./tags";

describe("editor tag helpers", () => {
  it("canonicalizes tag paths from the shared fixture corpus", () => {
    for (const testCase of fixtures.pathCases) {
      expect(canonicalizeTagPath(testCase.raw)).toBe(testCase.canonical);
      expect(renderTagToken(testCase.raw)).toBe(testCase.rendered);
    }
  });

  it("matches tag entities from the shared fixture corpus", () => {
    for (const testCase of fixtures.entityCases) {
      const match = findTagEntityMatch(testCase.text);

      if (testCase.match) {
        expect(match).toEqual({
          start: testCase.match.start,
          end: testCase.match.end,
        });
      } else {
        expect(match).toBeNull();
      }
    }
  });

  it("matches completion at the cursor for simple tags", () => {
    expect(matchTagCompletionAtEnd("hello #wor")).toEqual({
      matchingString: "wor",
      leadOffset: 6,
      replaceableLength: 4,
    });
    expect(matchTagCompletionAtEnd("hello #work/proj")).toEqual({
      matchingString: "work/proj",
      leadOffset: 6,
      replaceableLength: 10,
    });
  });

  it("matches completion at the cursor for wrapped-like partials", () => {
    expect(matchTagCompletionAtEnd("hello #project al")).toEqual({
      matchingString: "project al",
      leadOffset: 6,
      replaceableLength: 11,
    });
    expect(matchTagCompletionAtEnd("hello #work/ project al")).toEqual({
      matchingString: "work/project al",
      leadOffset: 6,
      replaceableLength: 17,
    });
  });

  it("rejects invalid completion candidates", () => {
    expect(matchTagCompletionAtEnd("hello #")).toBeNull();
    expect(matchTagCompletionAtEnd(String.raw`hello \#roadmap`)).toBeNull();
    expect(matchTagCompletionAtEnd("hello #!/bin")).toBeNull();
    expect(matchTagCompletionAtEnd("hello #work//proj")).toBeNull();
  });

  it("normalizes trailing slashes in canonical tag paths", () => {
    expect(canonicalizeTagPath("work/")).toBe("work");
    expect(canonicalizeTagPath("work///")).toBe("work");
    expect(canonicalizeTagPath("work/project/")).toBe("work/project");
  });

  it("normalizes tag partials for backend search", () => {
    expect(canonicalizeTagPartial("Work/ project  al")).toBe("work/project al");
    expect(canonicalizeTagPartial("work/")).toBe("work/");
  });
});
