"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YOUTUBE_TRANSFORMER = void 0;
const YouTubeNode_1 = require("./YouTubeNode");
/**
 * Extracts YouTube video ID from URL
 */
function extractYouTubeVideoId(text) {
    const match = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/.exec(text);
    // Return ID only if it's the right length (11 characters)
    return (match === null || match === void 0 ? void 0 : match[2]) && match[2].length === 11 ? match[2] : null;
}
/**
 * Checks if a string is a valid YouTube URL
 */
function isYouTubeUrl(text) {
    return (text.includes("youtube.com") ||
        text.includes("youtu.be") ||
        text.includes("youtube-nocookie.com"));
}
/**
 * Transformer for converting YouTube URLs in markdown to embedded YouTube nodes
 */
exports.YOUTUBE_TRANSFORMER = {
    dependencies: [],
    export: () => null,
    regExp: /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\S+/,
    replace: (parentNode, children, match) => {
        const url = match[0];
        if (!url || !isYouTubeUrl(url)) {
            return false;
        }
        const videoId = extractYouTubeVideoId(url);
        if (!videoId) {
            return false;
        }
        // Create YouTube node
        const youTubeNode = (0, YouTubeNode_1.$createYouTubeNode)(videoId);
        // Replace the matched element with our nodes
        parentNode.replace(youTubeNode);
        return true;
    },
    type: "element",
};
//# sourceMappingURL=YouTubeTransformer.js.map