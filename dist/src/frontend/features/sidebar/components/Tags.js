"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tags = Tags;
const jsx_runtime_1 = require("react/jsx-runtime");
const accordion_1 = require("~/components/ui/accordion");
const useTags_1 = require("~/hooks/useTags");
const store_1 = require("~/store");
const react_intersection_observer_1 = require("react-intersection-observer");
const Tag_1 = require("./Tag");
function Tags() {
    var _a;
    const activeNotebookId = (0, store_1.useAppState)((state) => state.activeNotebookId);
    const tags = (0, useTags_1.useTags)(activeNotebookId);
    const setLastTagVisible = (0, store_1.useAppState)((state) => state.setLastTagVisible);
    const { ref: lastTagRef } = (0, react_intersection_observer_1.useInView)({
        threshold: 1,
        onChange: (inView) => {
            if (inView) {
                setLastTagVisible(true);
            }
            else {
                setLastTagVisible(false);
            }
        },
    });
    if (tags.status === "pending") {
        return undefined;
    }
    if (tags.status === "error") {
        return (0, jsx_runtime_1.jsx)("div", { children: "Error fetching tags" });
    }
    return ((0, jsx_runtime_1.jsx)(accordion_1.Accordion, { type: "single", collapsible: true, defaultValue: "tags", children: (0, jsx_runtime_1.jsxs)(accordion_1.AccordionItem, { value: "tags", children: [(0, jsx_runtime_1.jsx)(accordion_1.AccordionTrigger, { className: "pt-3 pb-1.5", children: (0, jsx_runtime_1.jsx)("div", { className: "flex items-center", children: (0, jsx_runtime_1.jsx)("div", { className: "ml-1 text-xs", children: "Tags" }) }) }), (0, jsx_runtime_1.jsx)(accordion_1.AccordionContent, { className: "pl-3", children: (0, jsx_runtime_1.jsx)("div", { className: "flex flex-wrap gap-2 pt-2", children: (_a = tags.data) === null || _a === void 0 ? void 0 : _a.map((tag, index) => {
                            const isLastTag = index === tags.data.length - 1;
                            return ((0, jsx_runtime_1.jsx)("div", { ref: isLastTag ? lastTagRef : null, children: (0, jsx_runtime_1.jsx)(Tag_1.Tag, { tag: tag }) }, tag));
                        }) }) })] }) }));
}
//# sourceMappingURL=Tags.js.map