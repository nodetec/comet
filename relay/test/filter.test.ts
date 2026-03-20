import { describe, test, expect } from "bun:test";
import { matchFilter, matchFilters } from "../src/relay/filter";
import type { NostrEvent } from "../src/types";

const baseEvent: NostrEvent = {
  id: "a".repeat(64),
  pubkey: "b".repeat(64),
  created_at: 1700000000,
  kind: 1,
  tags: [
    ["e", "c".repeat(64)],
    ["p", "d".repeat(64)],
  ],
  content: "hello world",
  sig: "e".repeat(128),
};

describe("matchFilter", () => {
  test("empty filter matches everything", () => {
    expect(matchFilter(baseEvent, {})).toBe(true);
  });

  test("ids filter", () => {
    expect(matchFilter(baseEvent, { ids: ["a".repeat(64)] })).toBe(true);
    expect(matchFilter(baseEvent, { ids: ["f".repeat(64)] })).toBe(false);
  });

  test("authors filter", () => {
    expect(matchFilter(baseEvent, { authors: ["b".repeat(64)] })).toBe(true);
    expect(matchFilter(baseEvent, { authors: ["f".repeat(64)] })).toBe(false);
  });

  test("kinds filter", () => {
    expect(matchFilter(baseEvent, { kinds: [1, 2] })).toBe(true);
    expect(matchFilter(baseEvent, { kinds: [0, 3] })).toBe(false);
  });

  test("since filter", () => {
    expect(matchFilter(baseEvent, { since: 1699999999 })).toBe(true);
    expect(matchFilter(baseEvent, { since: 1700000001 })).toBe(false);
  });

  test("until filter", () => {
    expect(matchFilter(baseEvent, { until: 1700000001 })).toBe(true);
    expect(matchFilter(baseEvent, { until: 1699999999 })).toBe(false);
  });

  test("#e tag filter", () => {
    expect(matchFilter(baseEvent, { "#e": ["c".repeat(64)] })).toBe(true);
    expect(matchFilter(baseEvent, { "#e": ["f".repeat(64)] })).toBe(false);
  });

  test("#p tag filter", () => {
    expect(matchFilter(baseEvent, { "#p": ["d".repeat(64)] })).toBe(true);
    expect(matchFilter(baseEvent, { "#p": ["f".repeat(64)] })).toBe(false);
  });

  test("multiple conditions are ANDed", () => {
    expect(
      matchFilter(baseEvent, {
        kinds: [1],
        authors: ["b".repeat(64)],
        since: 1699999999,
      }),
    ).toBe(true);
    expect(
      matchFilter(baseEvent, {
        kinds: [1],
        authors: ["f".repeat(64)], // wrong author
      }),
    ).toBe(false);
  });
});

describe("matchFilters", () => {
  test("matches if any filter matches (OR)", () => {
    expect(
      matchFilters(baseEvent, [
        { kinds: [99] }, // no match
        { kinds: [1] }, // match
      ]),
    ).toBe(true);
  });

  test("no match if none match", () => {
    expect(
      matchFilters(baseEvent, [{ kinds: [99] }, { authors: ["f".repeat(64)] }]),
    ).toBe(false);
  });
});
