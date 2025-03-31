"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownImageComponent = MarkdownImageComponent;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const useLexicalEditable_1 = require("@lexical/react/useLexicalEditable");
const useLexicalNodeSelection_1 = require("@lexical/react/useLexicalNodeSelection");
const utils_1 = require("@lexical/utils");
const utils_2 = require("~/lib/utils");
const lexical_1 = require("lexical");
const MarkdownImageNode_1 = require("../nodes/MarkdownImageNode");
function LazyImage({ altText, className, imageRef, src, onError, }) {
    return ((0, jsx_runtime_1.jsx)("div", { className: "mr-1", children: (0, jsx_runtime_1.jsx)("img", { className: className !== null && className !== void 0 ? className : "", src: src, alt: altText, ref: imageRef, onError: onError, draggable: "false" }) }));
}
function BrokenImage() {
    return ((0, jsx_runtime_1.jsx)("img", { 
        // TODO: Add broken image src
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        src: null, style: {
            height: 200,
            opacity: 0.2,
            width: 200,
        }, draggable: "false" }));
}
function MarkdownImageComponent({ src, altText, nodeKey, }) {
    const imageRef = (0, react_1.useRef)(null);
    const [isSelected, setSelected, clearSelection] = (0, useLexicalNodeSelection_1.useLexicalNodeSelection)(nodeKey);
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    const activeEditorRef = (0, react_1.useRef)(null);
    const [isLoadError, setIsLoadError] = (0, react_1.useState)(false);
    const isEditable = (0, useLexicalEditable_1.useLexicalEditable)();
    const $onDelete = (0, react_1.useCallback)((payload) => {
        const deleteSelection = (0, lexical_1.$getSelection)();
        if (isSelected && (0, lexical_1.$isNodeSelection)(deleteSelection)) {
            const event = payload;
            event.preventDefault();
            deleteSelection.getNodes().forEach((node) => {
                if ((0, MarkdownImageNode_1.$isMarkdownImageNode)(node)) {
                    node.remove();
                }
            });
        }
        return false;
    }, [isSelected]);
    const $onEnter = (0, react_1.useCallback)((event) => {
        const latestSelection = (0, lexical_1.$getSelection)();
        if (isSelected &&
            (0, lexical_1.$isNodeSelection)(latestSelection) &&
            latestSelection.getNodes().length === 1) {
            event.preventDefault();
            // Get the image node
            const imageNode = (0, lexical_1.$getNodeByKey)(nodeKey);
            if (imageNode) {
                // Create a new paragraph
                const paragraphNode = (0, lexical_1.$createParagraphNode)();
                // Insert after the image
                imageNode.insertAfter(paragraphNode);
                // Set selection to the new paragraph
                paragraphNode.selectEnd();
            }
            // Clear the image selection
            clearSelection();
            return true;
        }
        return false;
    }, [isSelected, nodeKey, clearSelection]);
    const onClick = (0, react_1.useCallback)((payload) => {
        const event = payload;
        if (event.target === imageRef.current) {
            if (event.shiftKey) {
                setSelected(!isSelected);
            }
            else {
                clearSelection();
                setSelected(true);
            }
            return true;
        }
        return false;
    }, [isSelected, setSelected, clearSelection]);
    (0, react_1.useEffect)(() => {
        const unregister = (0, utils_1.mergeRegister)(editor.registerCommand(lexical_1.SELECTION_CHANGE_COMMAND, (_, activeEditor) => {
            activeEditorRef.current = activeEditor;
            return false;
        }, lexical_1.COMMAND_PRIORITY_LOW), editor.registerCommand(lexical_1.CLICK_COMMAND, onClick, lexical_1.COMMAND_PRIORITY_LOW), editor.registerCommand(lexical_1.KEY_DELETE_COMMAND, $onDelete, lexical_1.COMMAND_PRIORITY_LOW), editor.registerCommand(lexical_1.KEY_BACKSPACE_COMMAND, $onDelete, lexical_1.COMMAND_PRIORITY_LOW), editor.registerCommand(lexical_1.KEY_ENTER_COMMAND, $onEnter, lexical_1.COMMAND_PRIORITY_CRITICAL));
        return () => {
            unregister();
        };
    }, [
        clearSelection,
        editor,
        isSelected,
        nodeKey,
        $onDelete,
        $onEnter,
        onClick,
        setSelected,
    ]);
    const isFocused = isSelected && isEditable;
    return ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: isLoadError ? ((0, jsx_runtime_1.jsx)(BrokenImage, {})) : ((0, jsx_runtime_1.jsx)("div", { className: "max-w-xl", children: (0, jsx_runtime_1.jsx)(LazyImage, { className: (0, utils_2.cn)("mt-2 h-auto w-auto cursor-default rounded-md object-contain", isFocused && "outline-2 outline-blue-500 select-none"), src: src, altText: altText, imageRef: imageRef, onError: () => setIsLoadError(true) }) })) }));
}
//# sourceMappingURL=MarkdownImageComponent.js.map