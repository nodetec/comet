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
exports.NotesSearch = NotesSearch;
const jsx_runtime_1 = require("react/jsx-runtime");
const input_1 = require("~/components/ui/input");
const store_1 = require("~/store");
const lucide_react_1 = require("lucide-react"); // Import X icon
function NotesSearch() {
    const noteSearch = (0, store_1.useAppState)((state) => state.noteSearch);
    const setNoteSearch = (0, store_1.useAppState)((state) => state.setNoteSearch);
    const setAppFocus = (0, store_1.useAppState)((state) => state.setAppFocus);
    function handleSetSearchNote(e) {
        return __awaiter(this, void 0, void 0, function* () {
            if (e.target.value === "") {
                setNoteSearch("");
                return;
            }
            setNoteSearch(e.target.value);
        });
    }
    const handleFocus = () => {
        console.log("focus");
        setAppFocus({ panel: undefined, isFocused: true });
    };
    const clearSearch = () => {
        setNoteSearch("");
    };
    return ((0, jsx_runtime_1.jsx)("div", { className: "mr-[5px] flex items-center px-1 pt-2 pb-4 select-none", children: (0, jsx_runtime_1.jsxs)("div", { className: "relative w-full", children: [(0, jsx_runtime_1.jsx)(input_1.Input, { placeholder: "Search...", className: "text-muted-accent/80 placeholder:text-accent-foreground/60 focus-visible:ring-primary h-8 bg-transparent pr-8 text-sm select-none", onChange: handleSetSearchNote, value: noteSearch, onFocus: handleFocus }), noteSearch && ((0, jsx_runtime_1.jsx)("button", { onClick: clearSearch, className: "text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transform", "aria-label": "Clear search", children: (0, jsx_runtime_1.jsx)(lucide_react_1.X, { size: 16 }) }))] }) }));
}
//# sourceMappingURL=NotesSearch.js.map