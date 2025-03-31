"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ResizableLayout;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("@column-resizer/react");
const usehooks_1 = require("@uidotdev/usehooks");
const editor_1 = require("./features/editor");
const notes_1 = require("./features/notes");
const NoteList_1 = require("./features/notes/components/NoteList");
const sidebar_1 = require("./features/sidebar");
const useAppFocus_1 = __importDefault(require("./hooks/useAppFocus"));
const useEvents_1 = require("./hooks/useEvents");
const useSync_1 = require("./hooks/useSync");
function ResizableLayout() {
    (0, useAppFocus_1.default)();
    (0, useEvents_1.useEvents)();
    (0, useSync_1.useSync)();
    const size = (0, usehooks_1.useWindowSize)();
    return ((0, jsx_runtime_1.jsx)("div", { className: "flex h-dvh w-dvw flex-col items-center justify-center", children: (0, jsx_runtime_1.jsxs)(react_1.Container, { className: "relative h-full w-full", children: [(0, jsx_runtime_1.jsxs)(react_1.Section, { className: "bg-sidebar flex flex-col justify-between select-none", disableResponsive: true, defaultSize: size.width > 800 ? 200 : 180, minSize: 180, maxSize: size.width > 800 ? 300 : 180, children: [(0, jsx_runtime_1.jsx)(sidebar_1.SidebarHeader, {}), (0, jsx_runtime_1.jsx)(sidebar_1.SidebarNav, {}), (0, jsx_runtime_1.jsx)(sidebar_1.NewNotebookBtn, {})] }), (0, jsx_runtime_1.jsxs)(react_1.Bar, { className: "flex cursor-col-resize items-center", size: 8, children: [(0, jsx_runtime_1.jsx)("div", { className: "bg-sidebar h-full w-1" }), (0, jsx_runtime_1.jsx)("div", { className: "bg-border h-full w-[1px]" }), (0, jsx_runtime_1.jsx)("div", { className: "bg-background h-full w-1" })] }), (0, jsx_runtime_1.jsxs)(react_1.Section, { className: "flex h-full flex-col select-none", disableResponsive: true, defaultSize: 280, minSize: 210, maxSize: size.width > 800 ? 300 : 210, children: [(0, jsx_runtime_1.jsx)(notes_1.NotesHeader, {}), (0, jsx_runtime_1.jsx)(notes_1.NotesSearch, {}), (0, jsx_runtime_1.jsx)(NoteList_1.NoteList, {})] }), (0, jsx_runtime_1.jsx)(react_1.Bar, { className: "flex cursor-col-resize items-center", size: 5, children: (0, jsx_runtime_1.jsx)("div", { className: "bg-accent/40 h-full w-[1px]" }) }), (0, jsx_runtime_1.jsx)(react_1.Section, { minSize: size.width > 800 ? 300 : 210, children: (0, jsx_runtime_1.jsx)("div", { className: "flex h-screen w-full flex-1 flex-col items-center select-none", children: (0, jsx_runtime_1.jsx)(editor_1.Editor, {}) }) })] }) }));
}
//# sourceMappingURL=App.js.map