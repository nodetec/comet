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
exports.Tag = Tag;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_query_1 = require("@tanstack/react-query");
const utils_1 = require("~/lib/utils");
const store_1 = require("~/store");
function Tag({ tag }) {
    const queryClient = (0, react_query_1.useQueryClient)();
    const activeTags = (0, store_1.useAppState)((state) => state.activeTags);
    const setActiveTags = (0, store_1.useAppState)((state) => state.setActiveTags);
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    const setFeedType = (0, store_1.useAppState)((state) => state.setFeedType);
    const noteSearch = (0, store_1.useAppState)((state) => state.noteSearch);
    const handleTagClick = () => __awaiter(this, void 0, void 0, function* () {
        if (noteSearch !== "") {
            return;
        }
        if (feedType === "trash") {
            setFeedType("all");
        }
        // add tag to active tags if it doesn't exist
        if (!activeTags.includes(tag)) {
            setActiveTags([...activeTags, tag]);
        }
        else {
            // remove tag from active tags if it exists
            setActiveTags(activeTags.filter((t) => t !== tag));
        }
        yield queryClient.invalidateQueries({ queryKey: ["notes"] });
    });
    return ((0, jsx_runtime_1.jsxs)("div", { onClick: handleTagClick, className: (0, utils_1.cn)("rouned-md bg-accent text-secondary-foreground line-clamp-1 truncate rounded-md px-2 py-1 text-sm font-medium break-all overflow-ellipsis whitespace-break-spaces select-none", activeTags.includes(tag) &&
            noteSearch === "" &&
            "text-secondary-foreground bg-primary/30"), children: ["#", tag] }, tag));
}
//# sourceMappingURL=Tag.js.map