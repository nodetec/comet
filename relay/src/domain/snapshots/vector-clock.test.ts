import { describe, expect, test } from "bun:test";

import {
  MAX_SAFE_VECTOR_CLOCK_COUNTER,
  parseVisibleVectorClockFromTags,
} from "./vector-clock";

describe("visible vector clock parsing", () => {
  test("parses canonical vc tags", () => {
    expect(
      parseVisibleVectorClockFromTags([
        ["vc", "DEVICE-A", "1"],
        ["vc", "DEVICE-B", "2"],
      ]),
    ).toEqual({
      "DEVICE-A": 1,
      "DEVICE-B": 2,
    });
  });

  test("rejects zero counters", () => {
    expect(
      parseVisibleVectorClockFromTags([["vc", "DEVICE-A", "0"]]),
    ).toBeNull();
  });

  test("rejects non-canonical device ordering", () => {
    expect(
      parseVisibleVectorClockFromTags([
        ["vc", "DEVICE-B", "1"],
        ["vc", "DEVICE-A", "2"],
      ]),
    ).toBeNull();
  });

  test("rejects counters above the JS safe integer max", () => {
    expect(
      parseVisibleVectorClockFromTags([
        ["vc", "DEVICE-A", String(MAX_SAFE_VECTOR_CLOCK_COUNTER + 1)],
      ]),
    ).toBeNull();
  });

  test("rejects vc tags with extra values", () => {
    expect(
      parseVisibleVectorClockFromTags([["vc", "DEVICE-A", "1", "unexpected"]]),
    ).toBeNull();
  });
});
