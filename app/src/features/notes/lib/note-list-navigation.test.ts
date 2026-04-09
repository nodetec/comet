import { describe, expect, it } from "vitest";

import {
  getAdjacentNoteId,
  getNoteListNavigationDirectionForKey,
} from "@/features/notes/lib/note-list-navigation";

const notes = [{ id: "note-1" }, { id: "note-2" }, { id: "note-3" }];

describe("getAdjacentNoteId", () => {
  it("returns the next note id when moving forward", () => {
    expect(getAdjacentNoteId(notes, "note-2", "next")).toBe("note-3");
  });

  it("returns the previous note id when moving backward", () => {
    expect(getAdjacentNoteId(notes, "note-2", "previous")).toBe("note-1");
  });

  it("returns null when moving past the end of the list", () => {
    expect(getAdjacentNoteId(notes, "note-3", "next")).toBeNull();
  });

  it("returns null when moving before the start of the list", () => {
    expect(getAdjacentNoteId(notes, "note-1", "previous")).toBeNull();
  });

  it("returns null when the current note is not in the list", () => {
    expect(getAdjacentNoteId(notes, "missing-note", "next")).toBeNull();
  });
});

describe("getNoteListNavigationDirectionForKey", () => {
  it("maps ArrowDown and j to next", () => {
    expect(getNoteListNavigationDirectionForKey("ArrowDown")).toBe("next");
    expect(getNoteListNavigationDirectionForKey("j")).toBe("next");
    expect(getNoteListNavigationDirectionForKey("J")).toBe("next");
  });

  it("maps ArrowUp and k to previous", () => {
    expect(getNoteListNavigationDirectionForKey("ArrowUp")).toBe("previous");
    expect(getNoteListNavigationDirectionForKey("k")).toBe("previous");
    expect(getNoteListNavigationDirectionForKey("K")).toBe("previous");
  });

  it("returns null for unrelated keys", () => {
    expect(getNoteListNavigationDirectionForKey("Enter")).toBeNull();
  });
});
