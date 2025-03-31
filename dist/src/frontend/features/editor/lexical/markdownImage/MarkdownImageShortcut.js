"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownImageShortcutPlugin = void 0;
const react_1 = require("react");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const lexical_1 = require("lexical");
const MarkdownImageNode_1 = require("./nodes/MarkdownImageNode");
/**
 * React component that adds markdown image shortcut functionality to a Lexical editor
 * Detects patterns like ![alt text](url) and converts them to image nodes
 */
const MarkdownImageShortcutPlugin = () => {
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
            // We only want to trigger transforms as user types with a collapsed selection
            if (!(0, lexical_1.$isRangeSelection)(prevSelection) ||
                !(0, lexical_1.$isRangeSelection)(selection) ||
                !selection.isCollapsed() ||
                selection.is(prevSelection)) {
                return;
            }
            const anchorKey = selection.anchor.key;
            const anchorOffset = selection.anchor.offset;
            const anchorNode = editorState._nodeMap.get(anchorKey);
            if (!(0, lexical_1.$isTextNode)(anchorNode) ||
                !dirtyLeaves.has(anchorKey) ||
                (anchorOffset !== 1 && anchorOffset > prevSelection.anchor.offset + 1)) {
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
                transformImageMarkdown(parentNode, anchorNode, selection.anchor.offset);
            });
        });
        // Clean up the listener on unmount
        return removeUpdateListener;
    }, [editor]);
    /**
     * Transform markdown image syntax to an image node
     */
    const transformImageMarkdown = (_parentNode, anchorNode, anchorOffset) => {
        const textContent = anchorNode.getTextContent();
        // Define the image markdown pattern: ![alt text](url)
        const IMAGE_MARKDOWN_REGEX = /!\[(.*?)\]\((.*?)\)/;
        // Look for markdown image pattern
        const match = IMAGE_MARKDOWN_REGEX.exec(textContent);
        if (!match) {
            return false;
        }
        const [fullMatch, altText, url = ""] = match;
        const matchStartIndex = textContent.indexOf(fullMatch);
        const matchEndIndex = matchStartIndex + fullMatch.length;
        // Check if the cursor is just after the pattern
        if (matchEndIndex !== anchorOffset) {
            return false;
        }
        // Split text at the markdown pattern
        if (matchStartIndex > 0) {
            anchorNode.splitText(matchStartIndex);
        }
        let nodeToReplace;
        if (matchStartIndex === 0) {
            nodeToReplace = anchorNode;
        }
        else {
            const [, nodeToReplace_] = anchorNode.splitText(matchStartIndex, matchEndIndex);
            nodeToReplace = nodeToReplace_;
        }
        // Create and insert the image node
        const imageNode = (0, MarkdownImageNode_1.$createMarkdownImageNode)({
            src: url,
            altText: altText !== null && altText !== void 0 ? altText : "",
        });
        if (nodeToReplace) {
            nodeToReplace.replace(imageNode);
        }
        return true;
    };
    // This component doesn't render anything visible
    return null;
};
exports.MarkdownImageShortcutPlugin = MarkdownImageShortcutPlugin;
//# sourceMappingURL=MarkdownImageShortcut.js.map