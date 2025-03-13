export function extractHashtags(text: string): string[] {
  // Use a regular expression to match words starting with #.
  const tagRegex = /#(\w+)/g;
  const matches = text.match(tagRegex);

  if (!matches) return [];

  // Remove the # symbol and return unique tags.
  const tags = matches.map((tag) => tag.slice(1));
  return Array.from(new Set(tags)); // Ensure uniqueness.
}
