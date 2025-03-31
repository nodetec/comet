"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseContent = parseContent;
function parseContent(markdownContent, searchTerm) {
    var _a;
    // Split the content into lines
    const lines = markdownContent.split("\n");
    // Check if the first line is a header (only match single hashtag headers)
    const firstLine = ((_a = lines[0]) === null || _a === void 0 ? void 0 : _a.trim()) || "";
    const isHeader = /^#\s+(.*)$/.test(firstLine);
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
        // .replace(/\[.*?\]\(.*?\)/g, "") // Remove links
        // .replace(/`{1,3}.*?`{1,3}/g, "") // Remove inline and block code
        // .replace(/[*_~]{1,3}/g, "") // Remove emphasis (bold, italic, strikethrough)
        .replace(/^#\s+/gm, ""); // Strip only level 1 headers but keep the text
    // .replace(/^\s*[-*+]\s+/gm, "") // Remove list items
    // .replace(/^\s*\d+\.\s+/gm, ""); // Remove numbered list items
    if (searchTerm) {
        const linesAfterClean = cleanedContent.split("\n");
        const matchedLines = linesAfterClean.filter((line) => line.includes(searchTerm));
        return matchedLines.join("\n");
    }
    return cleanedContent.trim();
}
//# sourceMappingURL=parseContent.js.map