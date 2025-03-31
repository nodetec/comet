"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarNav = SidebarNav;
const jsx_runtime_1 = require("react/jsx-runtime");
const accordion_1 = require("~/components/ui/accordion");
const scroll_area_old_1 = require("~/components/ui/scroll-area-old");
const useTags_1 = require("~/hooks/useTags");
const utils_1 = require("~/lib/utils");
const store_1 = require("~/store");
const AllNotesBtn_1 = require("./AllNotesBtn");
const Notebooks_1 = require("./Notebooks");
const Tags_1 = require("./Tags");
const TrashNotesBtn_1 = require("./TrashNotesBtn");
function SidebarNav() {
    var _a, _b;
    const lastTagVisible = (0, store_1.useAppState)((state) => state.lastTagVisible);
    const tags = (0, useTags_1.useTags)();
    return ((0, jsx_runtime_1.jsx)(scroll_area_old_1.ScrollArea, { type: "scroll", className: (0, utils_1.cn)("flex h-full flex-col gap-y-2", !lastTagVisible && ((_b = (_a = tags.data) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0 && "border-b"), children: (0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col gap-y-1 pl-2 pr-1", children: [(0, jsx_runtime_1.jsx)(accordion_1.Accordion, { type: "single", collapsible: true, defaultValue: "notes", children: (0, jsx_runtime_1.jsxs)(accordion_1.AccordionItem, { value: "notes", children: [(0, jsx_runtime_1.jsx)(accordion_1.AccordionTrigger, { className: "ml-1 flex items-center pt-0 pb-1.5 text-xs", children: "Notes" }), (0, jsx_runtime_1.jsxs)(accordion_1.AccordionContent, { className: "flex flex-col gap-0.5 pb-0", children: [(0, jsx_runtime_1.jsx)(AllNotesBtn_1.AllNotesBtn, {}), (0, jsx_runtime_1.jsx)(TrashNotesBtn_1.TrashNotesBtn, {})] })] }) }), (0, jsx_runtime_1.jsx)(Notebooks_1.Notebooks, {}), (0, jsx_runtime_1.jsx)(Tags_1.Tags, {})] }) }));
}
//# sourceMappingURL=SidebarNav.js.map