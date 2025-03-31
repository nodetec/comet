"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractHashtags = extractHashtags;
const getHashtagRegexString_1 = require("./getHashtagRegexString");
function extractHashtags(text) {
    const REGEX = new RegExp((0, getHashtagRegexString_1.getHashtagRegexString)(), "gi");
    const matches = [...text.matchAll(REGEX)];
    if (!matches.length)
        return [];
    const hashtags = matches.map((m) => m[3]);
    return Array.from(new Set(hashtags));
}
//# sourceMappingURL=extractHashtags.js.map