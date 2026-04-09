export type NoteListNavigationDirection = "next" | "previous";

type NoteListItem = {
  id: string;
};

export function getAdjacentNoteId<T extends NoteListItem>(
  notes: T[],
  currentNoteId: string,
  direction: NoteListNavigationDirection,
) {
  const currentIndex = notes.findIndex((note) => note.id === currentNoteId);
  if (currentIndex === -1) {
    return null;
  }

  const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;

  return notes[nextIndex]?.id ?? null;
}
