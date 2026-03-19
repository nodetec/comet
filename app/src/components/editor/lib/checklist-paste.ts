export function parseSingleChecklistItemContent(
  markdown: string,
): string | null {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  let start = 0;
  while (start < lines.length && lines[start]?.trim() === "") {
    start++;
  }

  let end = lines.length - 1;
  while (end >= start && lines[end]?.trim() === "") {
    end--;
  }

  if (start > end || start !== end) {
    return null;
  }

  const match = /^\s*[-*+]\s+\[(?: |x|X)\]\s?(.*)$/.exec(lines[start] ?? "");
  return match ? match[1] : null;
}
