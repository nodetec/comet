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
