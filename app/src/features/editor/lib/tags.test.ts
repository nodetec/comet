import { describe, expect, it } from "vitest";

import fixtures from "@/shared/lib/tag-fixtures.json";

import {
  canonicalizeAuthoredTagToken,
  canonicalizeTagPartial,
  canonicalizeTagPath,
  matchTagCompletionAtCursor,
  findTagCompletionOptions,
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

  it("matches completion ranges in the middle of a tag token", () => {
    const text = "hello #project-alpha";
    expect(matchTagCompletionAtCursor(text, 10)).toEqual({
      from: 7,
      matchingString: "pro",
      to: text.length,
    });
  });

  it("does not match completion outside a tag token", () => {
    expect(matchTagCompletionAtCursor("hello project", 11)).toBeNull();
  });

  it("rejects invalid completion candidates", () => {
    expect(matchTagCompletionAtEnd("hello #")).toBeNull();
    expect(matchTagCompletionAtEnd(String.raw`hello \#roadmap`)).toBeNull();
    expect(matchTagCompletionAtEnd("hello #!/bin")).toBeNull();
    expect(matchTagCompletionAtEnd("hello #work//proj")).toBeNull();
    expect(matchTagCompletionAtEnd("hello #project al")).toBeNull();
    expect(matchTagCompletionAtEnd("hello #work/ project al")).toBeNull();
  });

  it("normalizes trailing slashes in canonical tag paths", () => {
    expect(canonicalizeTagPath("work/")).toBe("work");
    expect(canonicalizeTagPath("work///")).toBe("work");
    expect(canonicalizeTagPath("work/project/")).toBe("work/project");
  });

  it("canonicalizes authored tag tokens", () => {
    expect(canonicalizeAuthoredTagToken("#roadmap")).toBe("roadmap");
    expect(canonicalizeAuthoredTagToken("#project alpha#")).toBeNull();
    expect(canonicalizeAuthoredTagToken("#work/")).toBe("work");
  });

  it("normalizes tag partials for backend search", () => {
    expect(canonicalizeTagPartial("Work/ project  al")).toBeNull();
    expect(canonicalizeTagPartial("work/")).toBe("work/");
  });

  it("ranks tag completion options by path prefix before segment prefix", () => {
    expect(
      findTagCompletionOptions(
        [
          "personal/projects",
          "project-alpha",
          "work/project-alpha",
          "work/projects",
        ],
        "proj",
      ),
    ).toEqual([
      "project-alpha",
      "personal/projects",
      "work/project-alpha",
      "work/projects",
    ]);
  });

  it("limits slash completions to matching descendants", () => {
    expect(
      findTagCompletionOptions(
        ["work", "work/client", "work/internal", "personal/workout"],
        "work/",
      ),
    ).toEqual(["work/client", "work/internal"]);
  });
});
