"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnBlurPlugin = OnBlurPlugin;
const react_1 = require("react");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const lexical_1 = require("lexical");
function OnBlurPlugin({ onBlur, }) {
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    (0, react_1.useEffect)(() => {
        editor.registerCommand(lexical_1.BLUR_COMMAND, (event, editor) => {
            onBlur(event, editor);
            return true;
        }, lexical_1.COMMAND_PRIORITY_EDITOR);
    }, [editor, onBlur]);
    return null;
}
//# sourceMappingURL=OnBlurPlugin.js.map