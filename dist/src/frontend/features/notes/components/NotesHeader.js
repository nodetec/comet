"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotesHeader = NotesHeader;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const button_1 = require("~/components/ui/button");
const store_1 = require("~/store");
const lucide_react_1 = require("lucide-react");
const useCreateNote_1 = require("../hooks/useCreateNote");
function NotesHeader() {
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    const activeNotebookId = (0, store_1.useAppState)((state) => state.activeNotebookId);
    const activeNotebookName = (0, store_1.useAppState)((state) => state.activeNotebookName);
    const activeTags = (0, store_1.useAppState)((state) => state.activeTags);
    const createNote = (0, useCreateNote_1.useCreateNote)();
    const title = (0, react_1.useMemo)(() => {
        if (feedType === "all")
            return "All Notes";
        if (feedType === "notebook")
            return activeNotebookName;
        if (feedType === "trash")
            return "Trash";
    }, [activeNotebookName, feedType]);
    function handleDoubleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("double click");
        void window.api.toggleMaximize();
    }
    return ((0, jsx_runtime_1.jsxs)("div", { className: "draggable mr-[5px] flex justify-between px-1 pt-2", onDoubleClick: handleDoubleClick, children: [(0, jsx_runtime_1.jsxs)("div", { id: "notes-header", onDoubleClick: (e) => e.stopPropagation(), className: "flex cursor-default items-center justify-center gap-x-1 pl-2", children: [(0, jsx_runtime_1.jsx)("h1", { className: "line-clamp-1 truncate font-semibold break-all text-ellipsis whitespace-break-spaces select-none", children: title }), (0, jsx_runtime_1.jsx)(lucide_react_1.ChevronDown, { className: "text-muted-foreground mt-1 mr-4 h-[1rem] w-[1rem] shrink-0" })] }), (0, jsx_runtime_1.jsx)(button_1.Button, { type: "button", variant: "ghost", size: "icon", disabled: createNote.isPending, onClick: () => createNote.mutate({ notebookId: activeNotebookId, tags: activeTags }), onDoubleClick: (e) => e.stopPropagation(), children: (0, jsx_runtime_1.jsx)(lucide_react_1.PenBoxIcon, {}) })] }));
}
//# sourceMappingURL=NotesHeader.js.map