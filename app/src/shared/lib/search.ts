export function searchWordsFromQuery(searchQuery: string) {
  return [
    ...new Set(
      searchQuery
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  ];
}

export type SearchMatch = {
  from: number;
  to: number;
};

export function collectSearchMatches(
  text: string,
  searchQuery: string,
): SearchMatch[] {
  const normalizedQuery = searchQuery.toLocaleLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const normalizedText = text.toLocaleLowerCase();
  const matches: SearchMatch[] = [];
  let cursor = 0;

  while (cursor < normalizedText.length) {
    const from = normalizedText.indexOf(normalizedQuery, cursor);
    if (from === -1) {
      break;
    }

    matches.push({
      from,
      to: from + searchQuery.length,
    });
    cursor = from + Math.max(searchQuery.length, 1);
  }

  return matches;
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
