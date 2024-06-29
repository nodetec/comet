function isMarkdownHeading(text: string) {
  // A regular expression that matches strings that start with one or more '#' characters followed by a space
  const headingRegex = /^#+\s.*$/;

  return headingRegex.test(text);
}

export const parseTitle = (content: string) => {
  const firstLine = content.split("\n")[0];
  if (firstLine.length === 0) {
    const lines = content.split("\n");

    for (const line of lines) {
      if (isMarkdownHeading(line)) {
        return {
          title: line.replace(/^#+\s/, ""),
          lineNumber: lines.indexOf(line),
        };
      }
    }
  }

  let title = firstLine;

  if (isMarkdownHeading(firstLine)) {
    title = firstLine.replace(/^#+\s/, "");
  }

  if (title.length > 50) {
    title = title.slice(0, 50);
    title += "...";
  }

  title = title || "New Note";
  return { title, lineNumber: 0 };
};

export const parseContent = (content: string) => {
  const lines = content.split("\n");
  if (lines.length === 1) {
    return "";
  }
  const contentWithoutTitle = lines.slice(1).join("\n");
  // only show the first 3 lines of the content
  return contentWithoutTitle.split("\n").slice(0, 3).join("\n");
};
