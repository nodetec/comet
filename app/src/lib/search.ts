export function searchWordsFromQuery(searchQuery: string) {
  return Array.from(
    new Set(
      searchQuery
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  );
}

export type ActiveEditorSearchSource = "notes" | "editor" | null;

type ResolveActiveEditorSearchInput = {
  editorQuery: string;
  noteQuery: string;
};

export function resolveActiveEditorSearch({
  editorQuery,
  noteQuery,
}: ResolveActiveEditorSearchInput): {
  query: string;
  source: ActiveEditorSearchSource;
} {
  const hasEditorQuery = editorQuery.trim().length > 0;
  const hasNoteQuery = noteQuery.trim().length > 0;

  if (hasEditorQuery) {
    return { query: editorQuery, source: "editor" };
  }

  if (hasNoteQuery) {
    return { query: noteQuery, source: "notes" };
  }

  return { query: "", source: null };
}
