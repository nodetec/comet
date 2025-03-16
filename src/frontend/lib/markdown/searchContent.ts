export function searchContent(markdownContent?: string, searchTerm?: string) {
  if (!markdownContent) {
    return "";
  }

  const lines = markdownContent.split("\n");

  if (!searchTerm) {
    return lines.join("\n"); // Return all lines if no search term is provided
  }

  const matchedLines = lines.filter((line) =>
    line.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return matchedLines.join("\n");
}
