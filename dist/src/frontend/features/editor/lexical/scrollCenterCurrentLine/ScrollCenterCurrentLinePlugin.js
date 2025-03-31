"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScrollCenterCurrentLinePlugin = void 0;
const react_1 = require("react");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const lexical_1 = require("lexical");
const ScrollCenterCurrentLinePlugin = ({ viewportPercentage = 30, }) => {
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    const currentLineRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        return editor.registerCommand(lexical_1.KEY_ENTER_COMMAND, () => {
            editor.getEditorState().read(() => {
                const root = (0, lexical_1.$getRoot)();
                const children = root.getChildren();
                if (children.length > 0) {
                    const selection = (0, lexical_1.$getSelection)();
                    if ((0, lexical_1.$isRangeSelection)(selection)) {
                        const { focus } = selection;
                        const focusNode = focus.getNode();
                        const focusOffset = focus.offset;
                        const anchorNode = selection.anchor.getNode();
                        const blockNode = anchorNode.getTopLevelElementOrThrow();
                        const blockKey = blockNode.getKey();
                        const blockElement = editor.getElementByKey(blockKey);
                        // Detect and print out the part of the viewport that the cursor is in
                        const domNode = editor.getElementByKey(focusNode.getKey());
                        if (domNode) {
                            const rect = domNode.getBoundingClientRect();
                            const viewportHeight = window.innerHeight;
                            const cursorPosition = rect.top + focusOffset;
                            const threshold = viewportHeight * (viewportPercentage / 100);
                            if (cursorPosition > viewportHeight - threshold) {
                                // console.log(
                                //   `Cursor is in the bottom ${viewportPercentage}% of the viewport`,
                                // );
                                requestAnimationFrame(() => {
                                    currentLineRef.current = blockElement;
                                    currentLineRef.current.scrollIntoView({
                                        behavior: "smooth",
                                        block: "center",
                                    });
                                });
                            }
                        }
                    }
                }
            });
            return true;
        }, lexical_1.COMMAND_PRIORITY_HIGH);
    }, [editor, viewportPercentage]);
    return null;
};
exports.ScrollCenterCurrentLinePlugin = ScrollCenterCurrentLinePlugin;
//# sourceMappingURL=ScrollCenterCurrentLinePlugin.js.map