"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllNotesBtn = AllNotesBtn;
const jsx_runtime_1 = require("react/jsx-runtime");
const SidebarButton_1 = require("~/components/ui/SidebarButton");
const store_1 = require("~/store");
const lucide_react_1 = require("lucide-react");
function AllNotesBtn() {
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    const setFeedType = (0, store_1.useAppState)((state) => state.setFeedType);
    const appFocus = (0, store_1.useAppState)((state) => state.appFocus);
    const setAppFocus = (0, store_1.useAppState)((state) => state.setAppFocus);
    const setNoteSearch = (0, store_1.useAppState)((state) => state.setNoteSearch);
    // const notebookId = useAppState((state) => state.activeNotebookId);
    const setActiveNotebookId = (0, store_1.useAppState)((state) => state.setActiveNotebookId);
    const setActiveNotebookName = (0, store_1.useAppState)((state) => state.setActiveNotebookName);
    function handleAllNotesClick() {
        return __awaiter(this, void 0, void 0, function* () {
            setNoteSearch("");
            setFeedType("all");
            setActiveNotebookId(undefined);
            setActiveNotebookName(undefined);
            setAppFocus({ panel: "sidebar", isFocused: true });
        });
    }
    const isFocused = (appFocus === null || appFocus === void 0 ? void 0 : appFocus.panel) === "sidebar" && appFocus.isFocused && feedType === "all";
    return ((0, jsx_runtime_1.jsx)(SidebarButton_1.SidebarButton, { isFocused: isFocused, onClick: handleAllNotesClick, isActive: feedType === "all", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.StickyNoteIcon, { "data-focused": isFocused }), label: "All Notes" }));
}
//# sourceMappingURL=AllNotesBtn.js.map