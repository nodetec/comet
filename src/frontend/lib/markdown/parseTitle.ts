import dayjs from "dayjs";

export function parseTitle(markdownContent: string) {
  //   console.log("markdownContent", markdownContent);
  // Split the content into lines
  const lines = markdownContent.split("\n");

  // Get the first line
  const firstLine = lines[0].trim();

  // Check if the first line is a header
  const headerMatch = /^#+\s+(.*)$/.exec(firstLine);

  //   console.log("headerMatch", headerMatch);

  if (headerMatch) {
    // Extract and return the title without the header markdown and remove ** on either side
    return headerMatch[1].replace(/^\*\*(.*)\*\*$/, "$1");
  }

  // Return null if no header is found on the first line
  return dayjs().format("YYYY-MM-DD");
}
