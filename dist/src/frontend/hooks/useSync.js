"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSync = void 0;
const react_1 = require("react");
const react_query_1 = require("@tanstack/react-query");
const useSync = () => {
    const queryClient = (0, react_query_1.useQueryClient)();
    (0, react_1.useEffect)(() => {
        const appSynced = (_) => {
            void queryClient.invalidateQueries({ queryKey: ["notes"] });
            void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
            void queryClient.invalidateQueries({ queryKey: ["tags"] });
            const queryKey = ["note"];
            void queryClient.resetQueries({ queryKey });
        };
        const cleanup = window.api.onSync(appSynced);
        return cleanup;
    }, [queryClient]);
};
exports.useSync = useSync;
//# sourceMappingURL=useSync.js.map