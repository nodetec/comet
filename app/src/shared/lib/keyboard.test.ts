import { describe, expect, it } from "vitest";

import {
  isCommandPaletteShortcut,
  isEditorFindShortcut,
  isNotesSearchShortcut,
} from "./keyboard";

function createKeyboardEvent(
  overrides: Partial<Parameters<typeof isEditorFindShortcut>[0]> = {},
): Parameters<typeof isEditorFindShortcut>[0] {
  return {
    altKey: false,
    code: "KeyF",
    ctrlKey: false,
    key: "f",
    metaKey: true,
    shiftKey: false,
    ...overrides,
  };
}

describe("isCommandPaletteShortcut", () => {
  it("matches Cmd+O", () => {
    expect(
      isCommandPaletteShortcut(
        createKeyboardEvent({
          code: "KeyO",
          key: "o",
        }),
      ),
    ).toBe(true);
  });

  it("matches Ctrl+O", () => {
    expect(
      isCommandPaletteShortcut(
        createKeyboardEvent({
          code: "KeyO",
          ctrlKey: true,
          key: "o",
          metaKey: false,
        }),
      ),
    ).toBe(true);
  });

  it("does not match when Shift is also pressed", () => {
    expect(
      isCommandPaletteShortcut(
        createKeyboardEvent({
          code: "KeyO",
          key: "O",
          shiftKey: true,
        }),
      ),
    ).toBe(false);
  });
});

describe("isEditorFindShortcut", () => {
  it("matches Cmd+F", () => {
    expect(isEditorFindShortcut(createKeyboardEvent())).toBe(true);
  });

  it("does not match Cmd+Shift+F", () => {
    expect(
      isEditorFindShortcut(
        createKeyboardEvent({
          key: "F",
          shiftKey: true,
        }),
      ),
    ).toBe(false);
  });

  it("does not match when Alt is also pressed", () => {
    expect(
      isEditorFindShortcut(
        createKeyboardEvent({
          altKey: true,
        }),
      ),
    ).toBe(false);
  });
});

describe("isNotesSearchShortcut", () => {
  it("matches Cmd+Shift+F", () => {
    expect(
      isNotesSearchShortcut(
        createKeyboardEvent({
          key: "F",
          shiftKey: true,
        }),
      ),
    ).toBe(true);
  });

  it("does not match Cmd+F", () => {
    expect(isNotesSearchShortcut(createKeyboardEvent())).toBe(false);
  });
});
