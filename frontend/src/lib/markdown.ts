import dayjs from "dayjs";

// import rehypeExternalLinks from "rehype-external-links";
// import rehypeStringify from "rehype-stringify";
// import remarkHtml from "remark-html";
// import remarkParse from "remark-parse";
// import remarkRehype from "remark-rehype";
// import remarkYoutube from "remark-youtube";
// import { unified } from "unified";

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

  return cleanedContent;
}

export const getTag = (name: string, tags: string[][]) => {
  const [itemTag] = tags.filter((tag: string[]) => tag[0] === name);
  const [, item] = itemTag ?? [, undefined];
  return item;
};

// export function processArticle(content: string | undefined) {
//   if (!content) {
//     return "";
//   }

//   const processedContent = unified()
//     .use(remarkParse)
//     .use(remarkHtml)
//     .use(remarkYoutube)
//     .use(remarkRehype)
//     .use(rehypeExternalLinks, {
//       target: "_blank",
//       rel: ["noopener", "noreferrer", "nofollow"],
//     })
//     .use(rehypeStringify)
//     .processSync(content)
//     .toString();

//   return processedContent;
// }
