"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnFocusPlugin = OnFocusPlugin;
const react_1 = require("react");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const lexical_1 = require("lexical");
function OnFocusPlugin({ onFocus, }) {
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    (0, react_1.useEffect)(() => {
        editor.registerCommand(lexical_1.FOCUS_COMMAND, (event, editor) => {
            onFocus(event, editor);
            return true;
        }, lexical_1.COMMAND_PRIORITY_EDITOR);
    }, [editor, onFocus]);
    return null;
}
//# sourceMappingURL=OnFocus.js.map