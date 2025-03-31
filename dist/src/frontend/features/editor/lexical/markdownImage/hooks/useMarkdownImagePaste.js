"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMarkdownImagePaste = useMarkdownImagePaste;
const react_1 = require("react");
const lexical_1 = require("lexical");
const MarkdownImageNode_1 = require("../nodes/MarkdownImageNode");
const IMAGE_MARKDOWN_REGEX = /!\[(.*?)\]\((.*?)\)/;
function useMarkdownImagePaste(editor) {
    (0, react_1.useEffect)(() => {
        const removePasteOverride = editor.registerCommand(lexical_1.PASTE_COMMAND, (event) => {
            var _a, _b, _c;
            event.preventDefault();
            const text = (_b = (_a = event.clipboardData) === null || _a === void 0 ? void 0 : _a.getData("text/plain")) === null || _b === void 0 ? void 0 : _b.trim();
            if (!text)
                return false;
            const match = IMAGE_MARKDOWN_REGEX.exec(text);
            if (match) {
                const altText = (_c = match[1]) !== null && _c !== void 0 ? _c : "";
                const url = match[2];
                editor.update(() => {
                    const selection = (0, lexical_1.$getSelection)();
                    if (!(0, lexical_1.$isRangeSelection)(selection))
                        return;
                    if (!selection.isCollapsed()) {
                        selection.removeText();
                    }
                    // TODO: fix url ""
                    const imageNode = (0, MarkdownImageNode_1.$createMarkdownImageNode)({
                        src: url !== null && url !== void 0 ? url : "",
                        altText,
                    });
                    selection.insertNodes([imageNode]);
                });
                return true;
            }
            return false;
        }, lexical_1.COMMAND_PRIORITY_HIGH);
        return () => {
            removePasteOverride();
        };
    }, [editor]);
}
//# sourceMappingURL=useMarkdownImagePaste.js.map