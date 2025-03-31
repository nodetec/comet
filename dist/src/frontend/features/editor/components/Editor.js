"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Editor = Editor;
const jsx_runtime_1 = require("react/jsx-runtime");
const code_1 = require("@lexical/code");
const hashtag_1 = require("@lexical/hashtag");
const link_1 = require("@lexical/link");
const list_1 = require("@lexical/list");
const markdown_1 = require("@lexical/markdown");
const LexicalClickableLinkPlugin_1 = require("@lexical/react/LexicalClickableLinkPlugin");
const LexicalComposer_1 = require("@lexical/react/LexicalComposer");
const LexicalContentEditable_1 = require("@lexical/react/LexicalContentEditable");
const LexicalErrorBoundary_1 = require("@lexical/react/LexicalErrorBoundary");
const LexicalHistoryPlugin_1 = require("@lexical/react/LexicalHistoryPlugin");
const LexicalHorizontalRuleNode_1 = require("@lexical/react/LexicalHorizontalRuleNode");
const LexicalLinkPlugin_1 = require("@lexical/react/LexicalLinkPlugin");
const LexicalListPlugin_1 = require("@lexical/react/LexicalListPlugin");
const LexicalMarkdownShortcutPlugin_1 = require("@lexical/react/LexicalMarkdownShortcutPlugin");
const LexicalRichTextPlugin_1 = require("@lexical/react/LexicalRichTextPlugin");
const LexicalTabIndentationPlugin_1 = require("@lexical/react/LexicalTabIndentationPlugin");
const rich_text_1 = require("@lexical/rich-text");
const store_1 = require("~/store");
const lexical_1 = require("lexical");
const useNote_1 = require("../hooks/useNote");
const useSaveNote_1 = require("../hooks/useSaveNote");
const AutoLinkPlugin_1 = __importDefault(require("../lexical/autolink/AutoLinkPlugin"));
const MarkdownCodeBlockShortcutPlugin_1 = require("../lexical/codeblock/MarkdownCodeBlockShortcutPlugin");
const CustomHashtagPlugin_1 = require("../lexical/customHashtag/CustomHashtagPlugin");
const MarkdownImageShortcut_1 = require("../lexical/markdownImage/MarkdownImageShortcut");
const MarkdownImageNode_1 = require("../lexical/markdownImage/nodes/MarkdownImageNode");
const MarkdownImageTransformer_1 = require("../lexical/markdownImage/transformers/MarkdownImageTransformer");
const OnChangeDebouncePlugin_1 = require("../lexical/onChangeDebounce/OnChangeDebouncePlugin");
const OnFocus_1 = require("../lexical/onFocus/OnFocus");
const ScrollCenterCurrentLinePlugin_1 = require("../lexical/scrollCenterCurrentLine/ScrollCenterCurrentLinePlugin");
const tabFocus_1 = __importDefault(require("../lexical/tabFocus"));
const ToolbarPlugin_1 = require("../lexical/toolbar/ToolbarPlugin");
const YouTubeNode_1 = require("../lexical/youtube/YouTubeNode");
const YouTubeTransformer_1 = require("../lexical/youtube/YouTubeTransformer");
const DefaultTheme_1 = __importDefault(require("../themes/DefaultTheme"));
const DummyEditor_1 = require("./DummyEditor");
const EditorClickWrapper_1 = require("./EditorClickWrapper");
function onError(error) {
    console.error(error);
}
function Editor() {
    var _a;
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    const setAppFocus = (0, store_1.useAppState)((state) => state.setAppFocus);
    const activeNoteId = (0, store_1.useAppState)((state) => state.activeNoteId);
    const note = (0, useNote_1.useNote)();
    const saveNote = (0, useSaveNote_1.useSaveNote)();
    const COMBINED_TRANSFORMERS = [
        MarkdownImageTransformer_1.MARKDOWN_IMAGE_TRANSFORMER,
        YouTubeTransformer_1.YOUTUBE_TRANSFORMER,
        ...markdown_1.TRANSFORMERS,
    ];
    if (note.isLoading) {
        return (0, jsx_runtime_1.jsx)(DummyEditor_1.DummyEditor, {});
    }
    if (!note.data || !activeNoteId) {
        // TODO: show some nice art or something here
        return (0, jsx_runtime_1.jsx)("div", { className: "draggable h-full w-full" });
    }
    function onChange(editorState) {
        console.log("onChange");
        saveNote.mutate({
            note: note.data,
            editor: editorState,
            transformers: COMBINED_TRANSFORMERS,
            shouldInvalidate: true,
        });
    }
    function onFocus(_event, _editor) {
        setAppFocus({ panel: "editor", isFocused: true });
    }
    function handleClick(event) {
        if (feedType === "trash") {
            event.preventDefault();
            setAppFocus({ panel: "editor", isFocused: true });
        }
    }
    function getInitalContent() {
        var _a, _b, _c, _d;
        (0, markdown_1.$convertFromMarkdownString)(((_a = note.data) === null || _a === void 0 ? void 0 : _a.content) === "" ? "# " : ((_c = (_b = note.data) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : ""), COMBINED_TRANSFORMERS, undefined, true);
        if (((_d = note.data) === null || _d === void 0 ? void 0 : _d.content) !== "") {
            (0, lexical_1.$setSelection)(null);
        }
    }
    const initialConfig = {
        namespace: "CometEditor",
        editorState: () => getInitalContent(),
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
    function handleDoubleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("double click");
        void window.api.toggleMaximize();
    }
    return ((0, jsx_runtime_1.jsxs)(LexicalComposer_1.LexicalComposer, { initialConfig: initialConfig, children: [(0, jsx_runtime_1.jsx)("div", { className: "bg-background draggable flex w-full justify-center py-2", onDoubleClick: handleDoubleClick, children: (0, jsx_runtime_1.jsx)(ToolbarPlugin_1.ToolbarPlugin, {}) }), (0, jsx_runtime_1.jsx)("div", { className: "bg-border mr-[5px] h-[1px] w-full" }), (0, jsx_runtime_1.jsx)(LexicalRichTextPlugin_1.RichTextPlugin, { contentEditable: (0, jsx_runtime_1.jsx)(EditorClickWrapper_1.EditorClickWrapper, { children: (0, jsx_runtime_1.jsx)(LexicalContentEditable_1.ContentEditable, { onClick: handleClick, className: "caret-primary mx-auto min-h-[calc(100vh-3.5rem)] max-w-[46rem] flex-1 flex-col px-12 pt-8 pb-[50%] select-text focus-visible:outline-none lg:pb-[40%] xl:pb-[30%]", 
                        // Add an id to make it easier to identify
                        id: "editor-content-editable" }) }), ErrorBoundary: LexicalErrorBoundary_1.LexicalErrorBoundary }), !((_a = note.data) === null || _a === void 0 ? void 0 : _a.trashedAt) && ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(OnChangeDebouncePlugin_1.OnChangeDebouncePlugin, { onChange: onChange, debounceTime: 500 }), (0, jsx_runtime_1.jsx)(OnFocus_1.OnFocusPlugin, { onFocus: onFocus })] })), (0, jsx_runtime_1.jsx)(MarkdownImageShortcut_1.MarkdownImageShortcutPlugin, {}), (0, jsx_runtime_1.jsx)(LexicalMarkdownShortcutPlugin_1.MarkdownShortcutPlugin, { transformers: COMBINED_TRANSFORMERS }), (0, jsx_runtime_1.jsx)(LexicalListPlugin_1.ListPlugin, {}), (0, jsx_runtime_1.jsx)(LexicalTabIndentationPlugin_1.TabIndentationPlugin, { maxIndent: 5 }), (0, jsx_runtime_1.jsx)(tabFocus_1.default, {}), (0, jsx_runtime_1.jsx)(LexicalHistoryPlugin_1.HistoryPlugin, {}), (0, jsx_runtime_1.jsx)(CustomHashtagPlugin_1.CustomHashtagPlugin, {}), (0, jsx_runtime_1.jsx)(ScrollCenterCurrentLinePlugin_1.ScrollCenterCurrentLinePlugin, {}), (0, jsx_runtime_1.jsx)(LexicalLinkPlugin_1.LinkPlugin, {}), (0, jsx_runtime_1.jsx)(LexicalClickableLinkPlugin_1.ClickableLinkPlugin, {}), (0, jsx_runtime_1.jsx)(AutoLinkPlugin_1.default, {}), (0, jsx_runtime_1.jsx)(MarkdownCodeBlockShortcutPlugin_1.MarkdownCodeBlockShortcutPlugin, {})] }, activeNoteId));
}
//# sourceMappingURL=Editor.js.map