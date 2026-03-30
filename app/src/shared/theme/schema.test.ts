import { describe, expect, it } from "vitest";

import type { ThemeData } from "@/shared/api/types";

import { THEME_COLOR_KEYS } from "./schema";

const bundledThemes = import.meta.glob("./themes/*.json", {
  eager: true,
}) as Record<string, ThemeData>;

describe("bundled themes", () => {
  const expectedKeys = new Set(THEME_COLOR_KEYS);

  for (const [path, theme] of Object.entries(bundledThemes)) {
    it(`${path} matches the full theme schema`, () => {
      expect(theme.appearance === "dark" || theme.appearance === "light").toBe(
        true,
      );
      expect(new Set(Object.keys(theme.colors))).toEqual(expectedKeys);
    });
  }
});
