"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notebooks = Notebooks;
const jsx_runtime_1 = require("react/jsx-runtime");
const accordion_1 = require("~/components/ui/accordion");
const useNotebooks_1 = require("~/hooks/useNotebooks");
const NotebookBtn_1 = require("./NotebookBtn");
function Notebooks() {
    var _a;
    const notebooks = (0, useNotebooks_1.useNotebooks)(false);
    if (notebooks.status === "pending") {
        return undefined;
    }
    if (notebooks.status === "error") {
        return (0, jsx_runtime_1.jsx)("div", { children: "Error fetching notebooks" });
    }
    return ((0, jsx_runtime_1.jsx)(accordion_1.Accordion, { type: "single", collapsible: true, defaultValue: "notebooks", children: (0, jsx_runtime_1.jsxs)(accordion_1.AccordionItem, { value: "notebooks", children: [(0, jsx_runtime_1.jsx)(accordion_1.AccordionTrigger, { className: "ml-1 flex items-center pt-3 pb-1.5 text-xs", children: "Notebooks" }), (0, jsx_runtime_1.jsx)(accordion_1.AccordionContent, { className: "flex flex-col gap-0.5 pb-0", children: (_a = notebooks.data) === null || _a === void 0 ? void 0 : _a.map((notebook) => ((0, jsx_runtime_1.jsx)(NotebookBtn_1.NotebookBtn, { notebook: notebook }, notebook._id))) })] }) }));
}
//# sourceMappingURL=Notebooks.js.map