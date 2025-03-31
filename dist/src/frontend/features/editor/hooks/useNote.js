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
exports.useNote = void 0;
const react_query_1 = require("@tanstack/react-query");
const store_1 = require("~/store");
function getNote(id) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("getNote", id);
        if (!id)
            return null;
        const note = yield window.api.getNote(id);
        console.log("getNote", note);
        return note;
    });
}
const useNote = () => {
    const activeNoteId = (0, store_1.useAppState)((state) => state.activeNoteId);
    return (0, react_query_1.useQuery)({
        queryKey: ["note", activeNoteId],
        refetchOnWindowFocus: false,
        gcTime: 0,
        staleTime: 0,
        // TODO: why doesn't this work for individual notes?
        // placeholderData: keepPreviousData,
        queryFn: () => getNote(activeNoteId),
    });
};
exports.useNote = useNote;
//# sourceMappingURL=useNote.js.map