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
exports.NotebookSettings = NotebookSettings;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_query_1 = require("@tanstack/react-query");
const button_1 = require("~/components/ui/button");
const scroll_area_old_1 = require("~/components/ui/scroll-area-old");
const useNotebooks_1 = require("~/hooks/useNotebooks");
const utils_1 = require("~/lib/utils");
const lucide_react_1 = require("lucide-react");
function NotebookSettings() {
    var _a, _b;
    const [loading, setLoading] = (0, react_1.useState)(false);
    const queryClient = (0, react_query_1.useQueryClient)();
    const notebooks = (0, useNotebooks_1.useNotebooks)(true);
    const toggleNotebookVisibility = (event, notebook) => __awaiter(this, void 0, void 0, function* () {
        event.preventDefault();
        setLoading(true);
        try {
            if (notebook.hidden) {
                yield window.api.unhideNotebook(notebook._id);
            }
            else {
                yield window.api.hideNotebook(notebook._id);
            }
            yield queryClient.invalidateQueries({ queryKey: ["notebooks"] });
        }
        catch (error) {
            console.error("Error updating notebook visibility: ", error);
        }
        finally {
            setLoading(false);
        }
    });
    return ((0, jsx_runtime_1.jsx)("div", { className: "flex h-full flex-col space-y-4", children: (0, jsx_runtime_1.jsxs)(scroll_area_old_1.ScrollArea, { type: "scroll", children: [(0, jsx_runtime_1.jsx)("h1", { className: "border-accent mx-12 border-b py-4 text-lg font-bold", children: "Notebooks" }), (0, jsx_runtime_1.jsx)("div", { className: "mx-12 my-4 h-full py-4", children: (0, jsx_runtime_1.jsxs)("div", { className: "border-accent space-y-4 border-b pb-4", children: [(_a = notebooks.data) === null || _a === void 0 ? void 0 : _a.map((notebook) => ((0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-between", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex items-center justify-start gap-3", children: [(0, jsx_runtime_1.jsx)(button_1.Button, { variant: "ghost", size: "icon", disabled: loading, onClick: (event) => toggleNotebookVisibility(event, notebook), children: notebook.hidden ? (0, jsx_runtime_1.jsx)(lucide_react_1.EyeClosedIcon, {}) : (0, jsx_runtime_1.jsx)(lucide_react_1.EyeIcon, {}) }), (0, jsx_runtime_1.jsx)("span", { children: notebook.name })] }), (0, jsx_runtime_1.jsx)("span", { className: "text-accent-foreground text-sm", children: `created ${(0, utils_1.fromNow)(notebook.createdAt)}` })] }, notebook._id))), ((_b = notebooks.data) === null || _b === void 0 ? void 0 : _b.length) === 0 && ((0, jsx_runtime_1.jsx)("div", { className: "text-accent-foreground text-sm", children: "No notebooks found" }))] }) })] }) }));
}
//# sourceMappingURL=NotebookSettings.js.map