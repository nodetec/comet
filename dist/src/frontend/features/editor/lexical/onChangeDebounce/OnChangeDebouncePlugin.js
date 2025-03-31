"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnChangeDebouncePlugin = OnChangeDebouncePlugin;
const react_1 = require("react");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
function OnChangeDebouncePlugin({ ignoreHistoryMergeTagChange = true, ignoreSelectionChange = true, onChange, debounceTime = 500, }) {
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    const debounceTimeout = (0, react_1.useRef)(null);
    (0, react_1.useLayoutEffect)(() => {
        if (onChange) {
            return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves, prevEditorState, tags, }) => {
                if ((ignoreSelectionChange &&
                    dirtyElements.size === 0 &&
                    dirtyLeaves.size === 0) ||
                    (ignoreHistoryMergeTagChange && tags.has("history-merge")) ||
                    prevEditorState.isEmpty()) {
                    return;
                }
                if (debounceTimeout.current) {
                    clearTimeout(debounceTimeout.current);
                }
                debounceTimeout.current = setTimeout(() => {
                    onChange(editorState, editor, tags);
                }, debounceTime);
            });
        }
    }, [
        editor,
        ignoreHistoryMergeTagChange,
        ignoreSelectionChange,
        onChange,
        debounceTime,
    ]);
    return null;
}
//# sourceMappingURL=OnChangeDebouncePlugin.js.map