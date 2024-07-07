import dayjs from "dayjs";

export function parseTitle(markdownContent: string) {
  // Split the content into lines
  const lines = markdownContent.split("\n");

  // Get the first line
  const firstLine = lines[0].trim();

  // Check if the first line is a header
  const headerMatch = firstLine.match(/^#+\s+(.*)$/);

  console.log("headerMatch", headerMatch);

  if (headerMatch) {
    // Extract and return the title without the header markdown
    return headerMatch[1];
  }

  // Return null if no header is found on the first line
  return dayjs().format("YYYY-MM-DD");
}

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

    return content;
}
