import { type InfiniteData } from "@tanstack/react-query";

import { type NotePagePayload } from "./types";

export function flattenNotePages(
  data: InfiniteData<NotePagePayload, unknown> | undefined,
) {
  return data?.pages.flatMap((page) => page.notes) ?? [];
}

export function nextSelectedNoteIdAfterRemoval(
  notes: NotePagePayload["notes"],
  removedNoteId: string,
) {
  const removedIndex = notes.findIndex((note) => note.id === removedNoteId);
  const remainingNotes = notes.filter((note) => note.id !== removedNoteId);

  if (remainingNotes.length === 0) {
    return null;
  }

  if (removedIndex < 0) {
    return remainingNotes[0]?.id ?? null;
  }

  return (
    remainingNotes[Math.min(removedIndex, remainingNotes.length - 1)]?.id ??
    null
  );
}
