"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MARKDOWN_IMAGE_TRANSFORMER = void 0;
const lexical_1 = require("lexical");
const MarkdownImageNode_1 = require("../nodes/MarkdownImageNode");
// Modified regex pattern to match markdown image anywhere in the text
// Removed the $ end anchor to allow text after the pattern
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/;
// Create a custom transformer for image nodes
exports.MARKDOWN_IMAGE_TRANSFORMER = {
    dependencies: [MarkdownImageNode_1.MarkdownImageNode],
    export: (node) => {
        if (!(0, MarkdownImageNode_1.$isMarkdownImageNode)(node))
            return null;
        const src = node.getSrc();
        const altText = node.getAltText() || "";
        return `![${altText}](${src})`;
    },
    // Match markdown image format: ![alt text](url) with potentially more text after
    importRegExp: MARKDOWN_IMAGE_REGEX,
    regExp: MARKDOWN_IMAGE_REGEX,
    type: "text-match",
    replace: (textNode, match) => {
        var _a, _b;
        // Extract alt text and source from the match
        const altText = String((_a = match[1]) !== null && _a !== void 0 ? _a : "");
        const src = String((_b = match[2]) !== null && _b !== void 0 ? _b : "");
        // Create an image node with the extracted data
        const imageNode = (0, MarkdownImageNode_1.$createMarkdownImageNode)({
            altText,
            src,
            maxWidth: 500, // Default max width
        });
        // Get the text content
        const textContent = textNode.getTextContent();
        // Find where the match ends in the original text
        const matchedText = match[0];
        const matchEndIndex = textContent.indexOf(matchedText) + matchedText.length;
        // Check if there's text after the image markdown
        const textAfter = textContent.substring(matchEndIndex);
        // Replace only the markdown part with the image node
        if (textAfter) {
            // Split the node: replace current with image and create a new text node after
            const newTextNode = (0, lexical_1.$createTextNode)(textAfter);
            textNode.replace(imageNode);
            imageNode.insertAfter(newTextNode);
        }
        else {
            // Simple replacement if there's no text after
            textNode.replace(imageNode);
        }
    },
};
//# sourceMappingURL=MarkdownImageTransformer.js.map