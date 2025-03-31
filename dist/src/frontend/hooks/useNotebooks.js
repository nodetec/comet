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
exports.useNotebooks = void 0;
const react_query_1 = require("@tanstack/react-query");
function fetchNotebooks(_a) {
    return __awaiter(this, arguments, void 0, function* ({ queryKey }) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [_, showHidden] = queryKey;
        try {
            return yield window.api.getNotebooks(showHidden);
        }
        catch (e) {
            console.error("Error fetching notebooks:", e);
            return null;
        }
    });
}
const useNotebooks = (showHidden) => {
    return (0, react_query_1.useQuery)({
        queryKey: ["notebooks", showHidden],
        refetchOnWindowFocus: false,
        placeholderData: react_query_1.keepPreviousData,
        queryFn: fetchNotebooks,
    });
};
exports.useNotebooks = useNotebooks;
//# sourceMappingURL=useNotebooks.js.map