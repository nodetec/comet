"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INSERT_IMAGE_COMMAND = void 0;
exports.useImageInsertCommand = useImageInsertCommand;
const react_1 = require("react");
const utils_1 = require("@lexical/utils");
const lexical_1 = require("lexical");
const MarkdownImageNode_1 = require("../nodes/MarkdownImageNode");
exports.INSERT_IMAGE_COMMAND = (0, lexical_1.createCommand)("INSERT_IMAGE_COMMAND");
function useImageInsertCommand(editor) {
    (0, react_1.useEffect)(() => {
        if (!editor.hasNodes([MarkdownImageNode_1.MarkdownImageNode])) {
            throw new Error("ImagePlugin: ImageNode not registered on editor");
        }
        return editor.registerCommand(exports.INSERT_IMAGE_COMMAND, (payload) => {
            const imageNode = (0, MarkdownImageNode_1.$createMarkdownImageNode)(payload);
            // Create a paragraph node after for better editing
            const paragraphAfter = (0, lexical_1.$createParagraphNode)();
            // Insert nodes at current selection
            (0, utils_1.$insertNodeToNearestRoot)(imageNode);
            imageNode.insertAfter(paragraphAfter);
            return true;
        }, lexical_1.COMMAND_PRIORITY_EDITOR);
    }, [editor]);
    return editor;
}
//# sourceMappingURL=useImageInsertCommand.js.map