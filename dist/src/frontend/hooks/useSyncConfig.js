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
exports.useSyncConfig = void 0;
const react_query_1 = require("@tanstack/react-query");
function fetchSyncConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        const syncConfig = yield window.api.getSyncConfig();
        console.log("syncConfig", syncConfig);
        return syncConfig !== null && syncConfig !== void 0 ? syncConfig : null;
    });
}
const useSyncConfig = () => {
    return (0, react_query_1.useQuery)({
        queryKey: ["syncConfig"],
        refetchOnWindowFocus: false,
        queryFn: fetchSyncConfig,
    });
};
exports.useSyncConfig = useSyncConfig;
//# sourceMappingURL=useSyncConfig.js.map