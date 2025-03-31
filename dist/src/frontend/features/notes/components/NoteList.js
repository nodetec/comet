"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoteList = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const scroll_area_old_1 = require("~/components/ui/scroll-area-old");
const utils_1 = require("~/lib/utils");
const react_intersection_observer_1 = require("react-intersection-observer");
const useNotes_1 = __importDefault(require("../hooks/useNotes"));
const NoteCard_1 = require("./NoteCard");
const NoteList = () => {
    const { status, data, isFetchingNextPage, fetchNextPage, hasNextPage } = (0, useNotes_1.default)();
    const { ref: lastNoteRef } = (0, react_intersection_observer_1.useInView)({
        onChange: (inView) => {
            if (inView && !isFetchingNextPage && hasNextPage) {
                console.log("fetching next page");
                void fetchNextPage();
            }
        },
    });
    if (status === "pending") {
        return undefined;
    }
    if (status === "error") {
        return (0, jsx_runtime_1.jsx)("div", { children: "Error fetching notes" });
    }
    const flattenedNotes = data.pages.flatMap((page) => page.data);
    return ((0, jsx_runtime_1.jsx)(scroll_area_old_1.ScrollArea, { type: "scroll", className: "h-screen", children: (0, jsx_runtime_1.jsx)("div", { className: "flex flex-col items-center px-1 mr-[5px]", children: flattenedNotes.map((note, index) => ((0, jsx_runtime_1.jsx)("div", { className: "mx-3 flex w-full flex-col items-center", ref: (0, utils_1.assignRef)(lastNoteRef, Math.floor(index / data.pages[0].data.length), index % data.pages[0].data.length, data), children: (0, jsx_runtime_1.jsx)(NoteCard_1.NoteCard, { note: note, index: index, length: flattenedNotes.length }) }, index))) }) }));
};
exports.NoteList = NoteList;
//# sourceMappingURL=NoteList.js.map