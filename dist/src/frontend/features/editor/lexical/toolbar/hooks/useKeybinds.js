"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useKeyBinds = void 0;
const constants_1 = require("../constants");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const react_1 = require("react");
const lexical_1 = require("lexical");
const useKeyBinds = ({ onAction, }) => {
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    (0, react_1.useEffect)(() => {
        editor.registerCommand(lexical_1.KEY_ENTER_COMMAND, (event) => {
            if ((event === null || event === void 0 ? void 0 : event.key) === "B" && (event === null || event === void 0 ? void 0 : event.ctrlKey)) {
                onAction(constants_1.RichTextAction.Bold);
            }
            if ((event === null || event === void 0 ? void 0 : event.key) === "I" && (event === null || event === void 0 ? void 0 : event.ctrlKey)) {
                onAction(constants_1.RichTextAction.Italics);
            }
            // if (event?.key === "U" && event?.ctrlKey) {
            //   onAction(RichTextAction.Underline);
            // }
            if ((event === null || event === void 0 ? void 0 : event.key) === "Z" && (event === null || event === void 0 ? void 0 : event.ctrlKey)) {
                onAction(constants_1.RichTextAction.Undo);
            }
            if ((event === null || event === void 0 ? void 0 : event.key) === "Y" && (event === null || event === void 0 ? void 0 : event.ctrlKey)) {
                onAction(constants_1.RichTextAction.Redo);
            }
            return false;
        }, constants_1.LOW_PRIORIRTY);
    }, [onAction, editor]);
};
exports.useKeyBinds = useKeyBinds;
//# sourceMappingURL=useKeybinds.js.map