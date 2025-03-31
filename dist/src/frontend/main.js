"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importDefault(require("react"));
const react_query_1 = require("@tanstack/react-query");
const react_query_devtools_1 = require("@tanstack/react-query-devtools");
const client_1 = __importDefault(require("react-dom/client"));
const sonner_1 = require("sonner");
const App_1 = __importDefault(require("./App"));
const tooltip_1 = require("./components/ui/tooltip");
const queryClient = new react_query_1.QueryClient({});
const rootElement = document.getElementById("root");
if (rootElement) {
    client_1.default.createRoot(rootElement).render((0, jsx_runtime_1.jsx)(react_1.default.StrictMode, { children: (0, jsx_runtime_1.jsxs)(react_query_1.QueryClientProvider, { client: queryClient, children: [(0, jsx_runtime_1.jsx)(react_query_devtools_1.ReactQueryDevtools, { buttonPosition: "bottom-right" }), (0, jsx_runtime_1.jsx)(tooltip_1.TooltipProvider, { children: (0, jsx_runtime_1.jsx)(App_1.default, {}) }), (0, jsx_runtime_1.jsx)(sonner_1.Toaster, {})] }) }));
}
//# sourceMappingURL=main.js.map