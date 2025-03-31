"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolbarPlugin = ToolbarPlugin;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const list_1 = require("@lexical/list");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const rich_text_1 = require("@lexical/rich-text");
const utils_1 = require("@lexical/utils");
const button_1 = require("~/components/ui/button");
const utils_2 = require("~/lib/utils");
const store_1 = require("~/store");
const lexical_1 = require("lexical");
const lucide_react_1 = require("lucide-react");
const PublishDialog_1 = require("../../components/PublishDialog");
const CodeBlockPlugin_1 = __importDefault(require("../codeblock/CodeBlockPlugin"));
const YouTubeActions_1 = __importDefault(require("../youtube/YouTubeActions"));
const constants_1 = require("./constants");
const useKeybinds_1 = require("./hooks/useKeybinds");
function ToolbarPlugin() {
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    const [disableMap, setDisableMap] = (0, react_1.useState)({
        [constants_1.RichTextAction.Undo]: true,
        [constants_1.RichTextAction.Redo]: true,
    });
    const [selectionMap, setSelectionMap] = (0, react_1.useState)({});
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const blockTypeToName = {
        paragraph: "Paragraph",
        h1: "Heading 1",
        h2: "Heading 2",
        h3: "Heading 3",
        // Add more mappings if needed
    };
    const [blockType, setBlockType] = (0, react_1.useState)("paragraph");
    // Use useCallback to memoize the updateToolbar function
    const updateToolbar = react_1.default.useCallback(() => {
        const selection = (0, lexical_1.$getSelection)();
        if ((0, lexical_1.$isRangeSelection)(selection)) {
            const newSelectionMap = {
                [constants_1.RichTextAction.Bold]: selection.hasFormat("bold"),
                [constants_1.RichTextAction.Italics]: selection.hasFormat("italic"),
                [constants_1.RichTextAction.Strikethrough]: selection.hasFormat("strikethrough"),
                [constants_1.RichTextAction.Code]: selection.hasFormat("code"),
            };
            setSelectionMap(newSelectionMap);
            const anchorNode = selection.anchor.getNode();
            const element = anchorNode.getKey() === "root"
                ? anchorNode
                : anchorNode.getTopLevelElementOrThrow();
            const elementKey = element.getKey();
            const elementDOM = editor.getElementByKey(elementKey);
            if (!elementDOM)
                return;
            if ((0, list_1.$isListNode)(element)) {
                const parentList = (0, utils_1.$getNearestNodeOfType)(anchorNode, list_1.ListNode);
                const type = parentList ? parentList.getTag() : element.getTag();
                setBlockType(type);
            }
            else {
                const type = (0, rich_text_1.$isHeadingNode)(element)
                    ? element.getTag()
                    : element.getType();
                setBlockType(type);
            }
        }
    }, [editor]);
    (0, react_1.useEffect)(() => {
        return (0, utils_1.mergeRegister)(editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                updateToolbar();
            });
        }), editor.registerCommand(lexical_1.SELECTION_CHANGE_COMMAND, () => {
            updateToolbar();
            return false;
        }, constants_1.LOW_PRIORIRTY), editor.registerCommand(lexical_1.CAN_UNDO_COMMAND, (payload) => {
            setDisableMap((prevDisableMap) => (Object.assign(Object.assign({}, prevDisableMap), { undo: !payload })));
            return false;
        }, constants_1.LOW_PRIORIRTY), editor.registerCommand(lexical_1.CAN_REDO_COMMAND, (payload) => {
            setDisableMap((prevDisableMap) => (Object.assign(Object.assign({}, prevDisableMap), { redo: !payload })));
            return false;
        }, constants_1.LOW_PRIORIRTY));
    }, [editor, updateToolbar]);
    const onAction = (id) => {
        switch (id) {
            case constants_1.RichTextAction.Bold: {
                editor.dispatchCommand(lexical_1.FORMAT_TEXT_COMMAND, "bold");
                break;
            }
            case constants_1.RichTextAction.Italics: {
                editor.dispatchCommand(lexical_1.FORMAT_TEXT_COMMAND, "italic");
                break;
            }
            case constants_1.RichTextAction.Strikethrough: {
                editor.dispatchCommand(lexical_1.FORMAT_TEXT_COMMAND, "strikethrough");
                break;
            }
            case constants_1.RichTextAction.Code: {
                editor.dispatchCommand(lexical_1.FORMAT_TEXT_COMMAND, "code");
                break;
            }
            case constants_1.RichTextAction.Undo: {
                editor.dispatchCommand(lexical_1.UNDO_COMMAND, undefined);
                break;
            }
            case constants_1.RichTextAction.Redo: {
                editor.dispatchCommand(lexical_1.REDO_COMMAND, undefined);
                break;
            }
        }
    };
    (0, useKeybinds_1.useKeyBinds)({ onAction });
    return ((0, jsx_runtime_1.jsxs)("div", { className: "flex w-full items-center px-2", children: [(0, jsx_runtime_1.jsx)("div", { className: "flex w-full items-center gap-2", children: (0, jsx_runtime_1.jsxs)("div", { className: "flex h-full items-center gap-2", children: [(0, jsx_runtime_1.jsx)(button_1.Button, { className: (0, utils_2.cn)(selectionMap[constants_1.RichTextAction.Bold] && "bg-accent/50"), size: "icon", variant: "ghost", onClick: () => onAction(constants_1.RichTextAction.Bold), disabled: disableMap[constants_1.RichTextAction.Bold] || feedType === "trash", onDoubleClick: (e) => e.stopPropagation(), children: (0, jsx_runtime_1.jsx)(lucide_react_1.BoldIcon, {}) }), (0, jsx_runtime_1.jsx)(button_1.Button, { className: (0, utils_2.cn)(selectionMap[constants_1.RichTextAction.Italics] && "bg-accent/50"), size: "icon", variant: "ghost", onClick: () => onAction(constants_1.RichTextAction.Italics), disabled: disableMap[constants_1.RichTextAction.Italics] || feedType === "trash", onDoubleClick: (e) => e.stopPropagation(), children: (0, jsx_runtime_1.jsx)(lucide_react_1.ItalicIcon, {}) }), (0, jsx_runtime_1.jsx)(button_1.Button, { className: (0, utils_2.cn)(selectionMap[constants_1.RichTextAction.Strikethrough] && "bg-accent/50"), size: "icon", variant: "ghost", onClick: () => onAction(constants_1.RichTextAction.Strikethrough), disabled: disableMap[constants_1.RichTextAction.Strikethrough] || feedType === "trash", onDoubleClick: (e) => e.stopPropagation(), children: (0, jsx_runtime_1.jsx)(lucide_react_1.StrikethroughIcon, {}) }), (0, jsx_runtime_1.jsx)(button_1.Button, { className: (0, utils_2.cn)("hidden md:flex", selectionMap[constants_1.RichTextAction.Code] && "bg-accent/50"), size: "icon", variant: "ghost", onClick: () => onAction(constants_1.RichTextAction.Code), disabled: disableMap[constants_1.RichTextAction.Code] || feedType === "trash", onDoubleClick: (e) => e.stopPropagation(), children: (0, jsx_runtime_1.jsx)(lucide_react_1.CodeIcon, {}) }), (0, jsx_runtime_1.jsx)("div", { className: "bg-accent hidden h-4 w-[1px] md:block" }), (0, jsx_runtime_1.jsx)(button_1.Button, { className: (0, utils_2.cn)("hidden md:flex", selectionMap[constants_1.RichTextAction.Undo] && "bg-accent/50"), size: "icon", variant: "ghost", onClick: () => onAction(constants_1.RichTextAction.Undo), disabled: disableMap[constants_1.RichTextAction.Undo] || feedType === "trash", onDoubleClick: (e) => e.stopPropagation(), children: (0, jsx_runtime_1.jsx)(lucide_react_1.UndoIcon, {}) }), (0, jsx_runtime_1.jsx)(button_1.Button, { className: (0, utils_2.cn)("hidden md:flex", selectionMap[constants_1.RichTextAction.Redo] && "bg-accent/50"), size: "icon", variant: "ghost", onClick: () => onAction(constants_1.RichTextAction.Redo), disabled: disableMap[constants_1.RichTextAction.Redo] || feedType === "trash", onDoubleClick: (e) => e.stopPropagation(), children: (0, jsx_runtime_1.jsx)(lucide_react_1.RedoIcon, {}) }), (0, jsx_runtime_1.jsx)("div", { className: "bg-accent hidden h-4 w-[1px] lg:block" }), (0, jsx_runtime_1.jsx)(CodeBlockPlugin_1.default, { blockType: blockType }), (0, jsx_runtime_1.jsx)(YouTubeActions_1.default, {})] }) }), (0, jsx_runtime_1.jsxs)("div", { className: "flex items-center gap-2", children: [(0, jsx_runtime_1.jsx)(PublishDialog_1.PublishDialog, {}), (0, jsx_runtime_1.jsx)(button_1.Button, { type: "button", variant: "ghost", size: "icon", children: (0, jsx_runtime_1.jsx)(lucide_react_1.EllipsisVerticalIcon, {}) })] })] }));
}
//# sourceMappingURL=ToolbarPlugin.js.map