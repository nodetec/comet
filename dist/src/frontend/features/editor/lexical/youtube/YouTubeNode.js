"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTubeNode = void 0;
exports.$createYouTubeNode = $createYouTubeNode;
exports.$isYouTubeNode = $isYouTubeNode;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const LexicalBlockWithAlignableContents_1 = require("@lexical/react/LexicalBlockWithAlignableContents");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const LexicalDecoratorBlockNode_1 = require("@lexical/react/LexicalDecoratorBlockNode");
const useLexicalEditable_1 = require("@lexical/react/useLexicalEditable");
const useLexicalNodeSelection_1 = require("@lexical/react/useLexicalNodeSelection");
const utils_1 = require("@lexical/utils");
const lexical_1 = require("lexical");
function YouTubeComponent({ format, nodeKey, videoID }) {
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    const [isSelected, , clearSelection] = (0, useLexicalNodeSelection_1.useLexicalNodeSelection)(nodeKey);
    const isEditable = (0, useLexicalEditable_1.useLexicalEditable)();
    const deleteNode = (0, react_1.useCallback)(() => {
        editor.update(() => {
            const node = (0, lexical_1.$getNodeByKey)(nodeKey);
            if (node) {
                node.remove();
            }
        });
    }, [editor, nodeKey]);
    const $onDelete = (0, react_1.useCallback)((payload) => {
        const deleteSelection = (0, lexical_1.$getSelection)();
        if (isSelected && (0, lexical_1.$isNodeSelection)(deleteSelection)) {
            const event = payload;
            event.preventDefault();
            deleteSelection.getNodes().forEach((node) => {
                if ($isYouTubeNode(node)) {
                    node.remove();
                }
            });
            return true;
        }
        return false;
    }, [isSelected]);
    const $onEnter = (0, react_1.useCallback)((event) => {
        const latestSelection = (0, lexical_1.$getSelection)();
        if (isSelected &&
            (0, lexical_1.$isNodeSelection)(latestSelection) &&
            latestSelection.getNodes().length === 1) {
            event.preventDefault();
            // Get the YouTube node
            const youtubeNode = (0, lexical_1.$getNodeByKey)(nodeKey);
            if (youtubeNode) {
                // Create a new paragraph
                const paragraphNode = (0, lexical_1.$createParagraphNode)();
                // Insert after the YouTube node
                youtubeNode.insertAfter(paragraphNode);
                // Set selection to the new paragraph
                paragraphNode.selectEnd();
            }
            // Clear the YouTube selection
            clearSelection();
            return true;
        }
        return false;
    }, [isSelected, nodeKey, clearSelection]);
    (0, react_1.useEffect)(() => {
        return (0, utils_1.mergeRegister)(editor.registerCommand(lexical_1.KEY_ENTER_COMMAND, $onEnter, lexical_1.COMMAND_PRIORITY_CRITICAL), editor.registerCommand(lexical_1.KEY_DELETE_COMMAND, $onDelete, lexical_1.COMMAND_PRIORITY_LOW), editor.registerCommand(lexical_1.KEY_BACKSPACE_COMMAND, $onDelete, lexical_1.COMMAND_PRIORITY_LOW));
    }, [editor, $onEnter, $onDelete]);
    const isFocused = isSelected && isEditable;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "relative", children: [(0, jsx_runtime_1.jsx)(LexicalBlockWithAlignableContents_1.BlockWithAlignableContents, { className: {
                    base: "flex w-full cursor-default items-center justify-center rounded-md border border-border/50 bg-zinc-950/30 p-8",
                    focus: "rounded-md ring-2 ring-blue-500",
                }, 
                // className={className}
                format: format, nodeKey: nodeKey, children: (0, jsx_runtime_1.jsx)("iframe", { className: "h-auto w-auto max-w-full sm:h-[315px] sm:w-[500px]", src: `https://www.youtube-nocookie.com/embed/${videoID}`, allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture", allowFullScreen: true, title: "YouTube video" }) }), isFocused && ((0, jsx_runtime_1.jsx)("button", { className: "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black bg-opacity-50 text-white transition-opacity hover:bg-opacity-70", onClick: (e) => {
                    e.stopPropagation();
                    deleteNode();
                }, "aria-label": "Remove YouTube embed", type: "button", children: (0, jsx_runtime_1.jsxs)("svg", { xmlns: "http://www.w3.org/2000/svg", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [(0, jsx_runtime_1.jsx)("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), (0, jsx_runtime_1.jsx)("line", { x1: "6", y1: "6", x2: "18", y2: "18" })] }) }))] }));
}
function $convertYoutubeElement(domNode) {
    const videoID = domNode.getAttribute("data-lexical-youtube");
    if (videoID) {
        const node = $createYouTubeNode(videoID);
        return { node };
    }
    return null;
}
class YouTubeNode extends LexicalDecoratorBlockNode_1.DecoratorBlockNode {
    static getType() {
        return "youtube";
    }
    static clone(node) {
        return new YouTubeNode(node.__id, node.__format, node.__key);
    }
    static importJSON(serializedNode) {
        return $createYouTubeNode(serializedNode.videoID).updateFromJSON(serializedNode);
    }
    exportJSON() {
        return Object.assign(Object.assign({}, super.exportJSON()), { videoID: this.__id });
    }
    constructor(id, format, key) {
        super(format, key);
        this.__id = id;
    }
    exportDOM() {
        const element = document.createElement("iframe");
        element.setAttribute("data-lexical-youtube", this.__id);
        element.setAttribute("width", "560");
        element.setAttribute("height", "315");
        element.setAttribute("src", `https://www.youtube-nocookie.com/embed/${this.__id}`);
        element.setAttribute("frameborder", "0");
        element.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
        element.setAttribute("allowfullscreen", "true");
        element.setAttribute("title", "YouTube video");
        return { element };
    }
    static importDOM() {
        return {
            iframe: (domNode) => {
                if (!domNode.hasAttribute("data-lexical-youtube")) {
                    return null;
                }
                return {
                    conversion: $convertYoutubeElement,
                    priority: 1,
                };
            },
        };
    }
    updateDOM() {
        return false;
    }
    getId() {
        return this.__id;
    }
    getTextContent() {
        return `https://www.youtube.com/watch?v=${this.__id}`;
    }
    decorate(_editor, config) {
        var _a, _b, _c;
        const embedBlockTheme = (_a = config.theme.embedBlock) !== null && _a !== void 0 ? _a : {};
        const className = {
            base: (_b = embedBlockTheme.base) !== null && _b !== void 0 ? _b : "",
            focus: (_c = embedBlockTheme.focus) !== null && _c !== void 0 ? _c : "",
        };
        return ((0, jsx_runtime_1.jsx)(YouTubeComponent, { className: className, format: this.__format, nodeKey: this.getKey(), videoID: this.__id }));
    }
}
exports.YouTubeNode = YouTubeNode;
function $createYouTubeNode(videoID) {
    return new YouTubeNode(videoID);
}
function $isYouTubeNode(node) {
    return node instanceof YouTubeNode;
}
//# sourceMappingURL=YouTubeNode.js.map