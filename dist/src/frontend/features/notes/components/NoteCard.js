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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoteCard = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const separator_1 = require("~/components/ui/separator");
const tooltip_1 = require("~/components/ui/tooltip");
const utils_1 = require("~/lib/utils");
const store_1 = require("~/store");
const lucide_react_1 = require("lucide-react");
const react_highlight_words_1 = __importDefault(require("react-highlight-words"));
const searchContent_1 = require("~/lib/markdown/searchContent");
// Wrap the component with React.memo to prevent unnecessary re-renders
function NoteCardBase({ note, index, length }) {
    const activeNoteId = (0, store_1.useAppState)((state) => state.activeNoteId);
    const setActiveNoteId = (0, store_1.useAppState)((state) => state.setActiveNoteId);
    const appFocus = (0, store_1.useAppState)((state) => state.appFocus);
    const setAppFocus = (0, store_1.useAppState)((state) => state.setAppFocus);
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    const active = activeNoteId === note._id;
    const noteSearch = (0, store_1.useAppState)((state) => state.noteSearch);
    // Memoize parsed content
    // const parsedContent = useMemo(
    //   () => parseContent(note.content) || "No content \n ",
    //   [note.content],
    // );
    // Memoize parsed content with search highlighting
    const parsedContentWithSearch = (0, react_1.useMemo)(() => (0, searchContent_1.searchContent)(note.previewContent, noteSearch) || "", [note.previewContent, noteSearch]);
    // Memoize date formatting
    const formattedUpdatedTime = (0, react_1.useMemo)(() => (note.contentUpdatedAt ? (0, utils_1.fromNow)(note.contentUpdatedAt) : ""), [note.contentUpdatedAt]);
    // Memoize published date formatting
    const formattedPublishedTime = (0, react_1.useMemo)(() => (note.publishedAt ? `published ${(0, utils_1.fromNow)(note.publishedAt)}` : ""), [note.publishedAt]);
    // Memoize isFocused calculation
    const isFocused = (0, react_1.useMemo)(() => (appFocus === null || appFocus === void 0 ? void 0 : appFocus.panel) === "feed" && appFocus.isFocused && active, [appFocus, active]);
    // Memoize event handlers with useCallback
    const handleSetActiveNote = (0, react_1.useCallback)((event) => __awaiter(this, void 0, void 0, function* () {
        event.preventDefault();
        setActiveNoteId(note._id);
        setAppFocus({ panel: "feed", isFocused: true });
        // void queryClient.invalidateQueries({ queryKey: ["note"] });
    }), [note._id, setActiveNoteId, setAppFocus]);
    const handleContextMenu = (0, react_1.useCallback)((_) => __awaiter(this, void 0, void 0, function* () {
        if (feedType === "all" || feedType === "notebook") {
            const notebooks = yield window.api.getNotebooks(true);
            console.log("notebooks test", notebooks);
            window.api.noteCardContextMenu(note, notebooks);
        }
        if (feedType === "trash") {
            window.api.trashNoteCardContextMenu(note._id);
        }
    }), [feedType, note]);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "mx-3 flex w-full flex-col items-center", children: [(0, jsx_runtime_1.jsx)("button", { "data-focused": isFocused, className: (0, utils_1.cn)("relative flex w-full cursor-default flex-col items-start gap-2 rounded-md p-2.5 text-left text-sm", active && "bg-accent/50 data-[focused=true]:bg-primary/30"), children: (0, jsx_runtime_1.jsx)("div", { className: "flex w-full flex-col gap-1", onContextMenu: handleContextMenu, onClick: handleSetActiveNote, children: (0, jsx_runtime_1.jsxs)("div", { className: "flex w-full flex-col gap-1.5", children: [noteSearch ? ((0, jsx_runtime_1.jsx)(react_highlight_words_1.default, { className: "line-clamp-1 truncate font-semibold break-all text-ellipsis whitespace-break-spaces select-none", highlightClassName: "bg-yellow-300 text-background", searchWords: [noteSearch], autoEscape: true, textToHighlight: note.title })) : ((0, jsx_runtime_1.jsx)("h2", { className: "text-secondary-foreground line-clamp-1 truncate font-semibold break-all text-ellipsis whitespace-break-spaces select-none", children: note.title })), noteSearch ? ((0, jsx_runtime_1.jsx)(react_highlight_words_1.default, { className: "text-muted-foreground/80 line-clamp-2 min-h-[3em] pt-0 break-all whitespace-break-spaces select-none", highlightClassName: "bg-yellow-300 text-background", searchWords: [noteSearch], autoEscape: true, 
                                // caseSensitive={true}
                                textToHighlight: parsedContentWithSearch })) : ((0, jsx_runtime_1.jsx)("div", { "data-focused": isFocused, className: "text-muted-foreground data-[focused=true]:text-secondary-foreground mt-0 line-clamp-2 min-h-[3em] pt-0 break-all text-ellipsis whitespace-break-spaces", children: note.previewContent })), (0, jsx_runtime_1.jsxs)("div", { className: "flex w-full items-center justify-between", children: [(0, jsx_runtime_1.jsx)("span", { "data-focused": isFocused, className: "text-muted-foreground/80 data-[focused=true]:text-secondary-foreground text-xs select-none", children: formattedUpdatedTime }), note.publishedAt && ((0, jsx_runtime_1.jsxs)(tooltip_1.Tooltip, { delayDuration: 200, children: [(0, jsx_runtime_1.jsx)(tooltip_1.TooltipTrigger, { asChild: true, className: "cursor-default", children: (0, jsx_runtime_1.jsx)("span", { "data-focused": isFocused, className: "data-[focused=true]:text-secondary-foreground text-primary/80 cursor-default text-xs select-none", children: (0, jsx_runtime_1.jsx)(lucide_react_1.SendIcon, { className: "h-4 w-4" }) }) }), (0, jsx_runtime_1.jsx)(tooltip_1.TooltipContent, { side: "right", children: (0, jsx_runtime_1.jsx)("span", { children: formattedPublishedTime }) })] }))] })] }) }) }), (0, jsx_runtime_1.jsx)("div", { className: "flex w-full flex-col items-center px-[0.30rem]", children: index < length - 1 && ((0, jsx_runtime_1.jsx)(separator_1.Separator, { decorative: true, className: "bg-accent/30" })) })] }));
}
// Export memoized component
exports.NoteCard = react_1.default.memo(NoteCardBase);
//# sourceMappingURL=NoteCard.js.map