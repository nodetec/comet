"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DummyEditor = DummyEditor;
const jsx_runtime_1 = require("react/jsx-runtime");
const code_1 = require("@lexical/code");
const hashtag_1 = require("@lexical/hashtag");
const link_1 = require("@lexical/link");
const list_1 = require("@lexical/list");
const LexicalComposer_1 = require("@lexical/react/LexicalComposer");
const LexicalContentEditable_1 = require("@lexical/react/LexicalContentEditable");
const LexicalErrorBoundary_1 = require("@lexical/react/LexicalErrorBoundary");
const LexicalHorizontalRuleNode_1 = require("@lexical/react/LexicalHorizontalRuleNode");
const LexicalRichTextPlugin_1 = require("@lexical/react/LexicalRichTextPlugin");
const rich_text_1 = require("@lexical/rich-text");
const scroll_area_old_1 = require("~/components/ui/scroll-area-old");
const store_1 = require("~/store");
const MarkdownImageNode_1 = require("../lexical/markdownImage/nodes/MarkdownImageNode");
const ToolbarPlugin_1 = require("../lexical/toolbar/ToolbarPlugin");
const YouTubeNode_1 = require("../lexical/youtube/YouTubeNode");
const DefaultTheme_1 = __importDefault(require("../themes/DefaultTheme"));
function onError(error) {
    console.error(error);
}
function DummyEditor() {
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    const activeNoteId = (0, store_1.useAppState)((state) => state.activeNoteId);
    const initialConfig = {
        namespace: "DummyEditor",
        nodes: [
            rich_text_1.HeadingNode,
            list_1.ListNode,
            list_1.ListItemNode,
            code_1.CodeHighlightNode,
            code_1.CodeNode,
            LexicalHorizontalRuleNode_1.HorizontalRuleNode,
            rich_text_1.QuoteNode,
            MarkdownImageNode_1.MarkdownImageNode,
            link_1.LinkNode,
            link_1.AutoLinkNode,
            hashtag_1.HashtagNode,
            code_1.CodeNode,
            code_1.CodeHighlightNode,
            YouTubeNode_1.YouTubeNode,
        ],
        onError,
        theme: DefaultTheme_1.default,
        editable: feedType === "trash" ? false : true,
    };
    return ((0, jsx_runtime_1.jsxs)(LexicalComposer_1.LexicalComposer, { initialConfig: initialConfig, children: [(0, jsx_runtime_1.jsx)("div", { className: "bg-background draggable flex w-full justify-center border-b py-2", children: (0, jsx_runtime_1.jsx)(ToolbarPlugin_1.ToolbarPlugin, {}) }), (0, jsx_runtime_1.jsx)(LexicalRichTextPlugin_1.RichTextPlugin, { contentEditable: (0, jsx_runtime_1.jsx)(scroll_area_old_1.ScrollArea, { className: "flex flex-1 flex-col", type: "scroll", children: (0, jsx_runtime_1.jsx)(LexicalContentEditable_1.ContentEditable, { className: "min-h-full flex-auto flex-col px-16 pt-8 pb-[50%] caret-sky-500/90 select-text focus-visible:outline-none" }) }), ErrorBoundary: LexicalErrorBoundary_1.LexicalErrorBoundary })] }, activeNoteId));
}
//# sourceMappingURL=DummyEditor.js.map