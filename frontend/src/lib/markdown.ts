import dayjs from "dayjs";
import { remark } from "remark";
import strip from "strip-markdown";

interface NoteSearchMatchIndices {
  start: number;
  end: number;
}

export function parseTitle(markdownContent: string) {
  // Split the content into lines
  const lines = markdownContent.split("\n");

  // Get the first line
  const firstLine = lines[0].trim();

  // Check if the first line is a header
  const headerMatch = firstLine.match(/^#+\s+(.*)$/);

  if (headerMatch) {
    // Extract and return the title without the header markdown
    return headerMatch[1];
  }

  // Return null if no header is found on the first line
  return dayjs().format("YYYY-MM-DD");
}

async function stripMarkdown(content: string) {
  const strippedMdContentVFile = await remark().use(strip).process(content);
  const strippedMdContent = String(strippedMdContentVFile);

  return strippedMdContent;
}

function addSpanTags(
  content: string,
  searchMatchIndices: NoteSearchMatchIndices[],
) {
  const spanTagOpen = `<span class='bg-primary text-primary-foreground rounded-sm'>`;
  const spanTagOpenLength = spanTagOpen.length;

  const spanTagClose = `</span>`;
  const spanTagCloseLength = spanTagClose.length;

  const spanTagLength = spanTagOpenLength + spanTagCloseLength;

  let numberOfSpanTagsAdded = 0;
  searchMatchIndices.forEach((match) => {
    content =
      content.substring(
        0,
        match.start + numberOfSpanTagsAdded * spanTagLength,
      ) +
      spanTagOpen +
      content.substring(match.start + numberOfSpanTagsAdded * spanTagLength);

    content =
      content.substring(
        0,
        match.end +
          1 +
          spanTagOpenLength +
          numberOfSpanTagsAdded * spanTagLength,
      ) +
      spanTagClose +
      content.substring(
        match.end +
          1 +
          spanTagOpenLength +
          numberOfSpanTagsAdded * spanTagLength,
      );

    numberOfSpanTagsAdded = numberOfSpanTagsAdded + 1;
  });
  return content;
}

export async function parseContent(
  markdownContent: string,
  noteSearch: string,
) {
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

  try {
    const strippedMdContent = await stripMarkdown(content);
    const searchMatchIndices: NoteSearchMatchIndices[] = [];
    let matchIndexStart = 0;
    let step = 0;
    if (noteSearch !== "") {
      while (step < strippedMdContent.length) {
        matchIndexStart = strippedMdContent.indexOf(noteSearch, step);
        if (matchIndexStart === -1) {
          break;
        }

        step = matchIndexStart + noteSearch.length;

        searchMatchIndices.push({
          start: matchIndexStart,
          end: step - 1,
        });
      }
    }
    const contentWithSpanTags = addSpanTags(
      strippedMdContent,
      searchMatchIndices,
    );

    return contentWithSpanTags;
  } catch {
    return content;
  }
}
