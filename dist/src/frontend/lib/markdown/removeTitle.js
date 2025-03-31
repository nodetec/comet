"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeTitle = removeTitle;
function removeTitle(markdown) {
    return markdown.replace(/^# .*\n/, "");
}
//# sourceMappingURL=removeTitle.js.map