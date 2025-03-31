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
exports.TrashNotesBtn = TrashNotesBtn;
const jsx_runtime_1 = require("react/jsx-runtime");
const SidebarButton_1 = require("~/components/ui/SidebarButton");
const store_1 = require("~/store");
const lucide_react_1 = require("lucide-react");
function TrashNotesBtn() {
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    const setFeedType = (0, store_1.useAppState)((state) => state.setFeedType);
    const appFocus = (0, store_1.useAppState)((state) => state.appFocus);
    const setAppFocus = (0, store_1.useAppState)((state) => state.setAppFocus);
    const setActiveNoteId = (0, store_1.useAppState)((state) => state.setActiveNoteId);
    const setActiveNotebookId = (0, store_1.useAppState)((state) => state.setActiveNotebookId);
    const setActiveNotebookName = (0, store_1.useAppState)((state) => state.setActiveNotebookName);
    const setActiveTags = (0, store_1.useAppState)((state) => state.setActiveTags);
    const setNoteSearch = (0, store_1.useAppState)((state) => state.setNoteSearch);
    function handleClick() {
        return __awaiter(this, void 0, void 0, function* () {
            setNoteSearch("");
            setActiveTags([]);
            setFeedType("trash");
            setAppFocus({ panel: "sidebar", isFocused: true });
            setActiveNotebookId(undefined);
            setActiveNotebookName(undefined);
            if (feedType === "trash")
                return;
            setActiveNoteId(undefined);
        });
    }
    const isFocused = (appFocus === null || appFocus === void 0 ? void 0 : appFocus.panel) === "sidebar" && appFocus.isFocused && feedType === "trash";
    return ((0, jsx_runtime_1.jsx)(SidebarButton_1.SidebarButton, { isFocused: isFocused, onClick: handleClick, isActive: feedType === "trash", icon: (0, jsx_runtime_1.jsx)(lucide_react_1.TrashIcon, { "data-focused": isFocused }), label: "Trash" }));
}
//# sourceMappingURL=TrashNotesBtn.js.map