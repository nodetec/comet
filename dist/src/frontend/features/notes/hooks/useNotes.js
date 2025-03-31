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
const react_query_1 = require("@tanstack/react-query");
const store_1 = require("~/store");
const useNotes = () => {
    const noteSearch = (0, store_1.useAppState)((state) => state.noteSearch);
    const activeNotebookId = (0, store_1.useAppState)((state) => state.activeNotebookId);
    //   const orderBy = useAppState((state) => state.orderBy);
    //   const timeSortDirection = useAppState((state) => state.timeSortDirection);
    //   const titleSortDirection = useAppState((state) => state.titleSortDirection);
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    const activeTags = (0, store_1.useAppState)((state) => state.activeTags);
    function fetchNotes(_a) {
        return __awaiter(this, arguments, void 0, function* ({ pageParam = 1 }) {
            const limit = 10;
            const offset = (pageParam - 1) * limit;
            // const orderDirection =
            //   orderBy === "title" ? titleSortDirection : timeSortDirection;
            // TODO: put search order on notebook
            const trashFeed = feedType === "trash";
            let notebookId;
            if (feedType === "notebook") {
                notebookId = activeNotebookId;
            }
            else if (feedType === "all") {
                notebookId = undefined;
            }
            let notes = [];
            if (noteSearch !== "") {
                notes = yield window.api.searchNotes(noteSearch, limit, offset, trashFeed, activeNotebookId);
            }
            else {
                notes = yield window.api.getNoteFeed(offset, limit, "contentUpdatedAt", "desc", notebookId, trashFeed, activeTags);
            }
            return {
                data: notes || [],
                nextPage: pageParam + 1,
                nextCursor: notes.length === limit ? pageParam + 1 : undefined,
            };
        });
    }
    return (0, react_query_1.useInfiniteQuery)({
        queryKey: [
            "notes",
            feedType,
            activeNotebookId,
            activeTags,
            noteSearch,
            //   orderBy,
            //   timeSortDirection,
            //   titleSortDirection,
        ],
        queryFn: fetchNotes,
        gcTime: 0,
        staleTime: 0,
        initialPageParam: 1,
        placeholderData: react_query_1.keepPreviousData,
        getNextPageParam: (lastPage, allPages, lastPageParam) => {
            if (lastPage.data.length === 0) {
                return undefined;
            }
            return lastPageParam + 1;
        },
    });
};
exports.default = useNotes;
//# sourceMappingURL=useNotes.js.map