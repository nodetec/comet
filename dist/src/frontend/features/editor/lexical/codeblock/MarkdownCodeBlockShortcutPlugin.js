"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownCodeBlockShortcutPlugin = void 0;
const react_1 = require("react");
const code_1 = require("@lexical/code");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const selection_1 = require("@lexical/selection");
const lexical_1 = require("lexical");
/**
 * React component that adds markdown code block shortcut functionality to a Lexical editor
 * Detects patterns like ``` and converts them to code block nodes
 */
const MarkdownCodeBlockShortcutPlugin = () => {
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    (0, react_1.useEffect)(() => {
        if (!editor) {
            return;
        }
        const removeUpdateListener = editor.registerUpdateListener(({ tags, dirtyLeaves, editorState, prevEditorState }) => {
            // Ignore updates from collaboration and undo/redo
            if (tags.has("collaboration") || tags.has("historic")) {
                return;
            }
            // If editor is still composing, wait until user confirms the key
            if (editor.isComposing()) {
                return;
            }
            const selection = editorState.read(lexical_1.$getSelection);
            const prevSelection = prevEditorState.read(lexical_1.$getSelection);
            // We want to trigger transforms as user types with a collapsed selection
            if (!(0, lexical_1.$isRangeSelection)(prevSelection) ||
                !(0, lexical_1.$isRangeSelection)(selection) ||
                !selection.isCollapsed()) {
                return;
            }
            const anchorKey = selection.anchor.key;
            const anchorNode = editorState._nodeMap.get(anchorKey);
            // Check if the node is a text node and has been updated
            if (!(0, lexical_1.$isTextNode)(anchorNode) || !dirtyLeaves.has(anchorKey)) {
                return;
            }
            // Apply the transformation
            editor.update(() => {
                if (!(0, lexical_1.$isTextNode)(anchorNode)) {
                    return;
                }
                const parentNode = anchorNode.getParent();
                if (parentNode === null) {
                    return;
                }
                transformCodeBlockMarkdown(parentNode, anchorNode, selection.anchor.offset);
            });
        });
        // Clean up the listener on unmount
        return removeUpdateListener;
    }, [editor]);
    /**
     * Transform markdown code block syntax to a code block node
     */
    const transformCodeBlockMarkdown = (parentNode, anchorNode, anchorOffset) => {
        const textContent = anchorNode.getTextContent();
        // Check if this node ends with exactly ```
        const endsWithTripleBacktick = textContent.endsWith("```");
        // Check if the cursor is right after the ```
        if (!endsWithTripleBacktick || anchorOffset !== textContent.length) {
            return false;
        }
        // Remove the backticks from the text content
        const cleanContent = textContent.slice(0, -3).trim();
        anchorNode.setTextContent(cleanContent);
        // Create a selection over the parent paragraph
        const selection = (0, lexical_1.$createRangeSelection)();
        selection.anchor.set(parentNode.getKey(), 0, "element");
        selection.focus.set(parentNode.getKey(), parentNode.getChildrenSize(), "element");
        (0, lexical_1.$setSelection)(selection);
        // Create the code block
        const codeNode = (0, code_1.$createCodeNode)();
        // Transform the selection to a code block
        (0, selection_1.$setBlocksType)(selection, () => codeNode);
        return true;
    };
    // This component doesn't render anything visible
    return null;
};
exports.MarkdownCodeBlockShortcutPlugin = MarkdownCodeBlockShortcutPlugin;
//# sourceMappingURL=MarkdownCodeBlockShortcutPlugin.js.map