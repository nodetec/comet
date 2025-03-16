export function parseContent(markdownContent: string) {
  // Split the content into lines
  const lines = markdownContent.split("\n");

  // Check if the first line is a header
  const firstLine = lines[0].trim();
  const isHeader = /^#+\s+(.*)$/.test(firstLine);

  // Determine the starting index for processing lines
  const startIndex = isHeader ? 1 : 0;

  // Filter out empty lines, ignoring the title if present
  const filteredLines = lines
    .slice(startIndex) // Start from the second line if the first line is a header
    .filter((line) => line.trim() !== "");

  // Join the lines back together with newlines
  const content = filteredLines.join("\n");

  // Remove all markdown elements
  const cleanedContent = content
    .replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
    .replace(/\[.*?\]\(.*?\)/g, "") // Remove links
    .replace(/`{1,3}.*?`{1,3}/g, "") // Remove inline and block code
    .replace(/[*_~]{1,3}/g, "") // Remove emphasis (bold, italic, strikethrough)
    .replace(/^#+\s+/gm, "") // Remove headers
    .replace(/^\s*[-*+]\s+/gm, "") // Remove list items
    .replace(/^\s*\d+\.\s+/gm, ""); // Remove numbered list items

  return cleanedContent.trim();
}
