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
exports.useTags = void 0;
const react_query_1 = require("@tanstack/react-query");
function fetchTags(notebookId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            if (notebookId) {
                return (_a = (yield window.api.getTagsByNotebookId(notebookId))) !== null && _a !== void 0 ? _a : [];
            }
            return (_b = (yield window.api.getAllTags())) !== null && _b !== void 0 ? _b : [];
        }
        catch (e) {
            console.error("Error fetching tags:", e);
            return [];
        }
    });
}
const useTags = (notebookId) => {
    return (0, react_query_1.useQuery)({
        queryKey: ["tags", notebookId],
        refetchOnWindowFocus: false,
        placeholderData: react_query_1.keepPreviousData,
        queryFn: () => fetchTags(notebookId),
    });
};
exports.useTags = useTags;
//# sourceMappingURL=useTags.js.map