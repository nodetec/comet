"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublishDialog = PublishDialog;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const badge_1 = require("~/components/ui/badge");
const button_1 = require("~/components/ui/button");
const dialog_1 = require("~/components/ui/dialog");
const input_1 = require("~/components/ui/input");
const usePublish_1 = require("~/features/editor/hooks/usePublish");
const store_1 = require("~/store");
const lucide_react_1 = require("lucide-react");
const useNote_1 = require("../hooks/useNote");
function PublishDialog() {
    var _a, _b, _c;
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    const [imageUrl, setImageUrl] = (0, react_1.useState)("");
    const keys = (0, store_1.useAppState)((state) => state.keys);
    const note = (0, useNote_1.useNote)();
    const { handlePublish } = (0, usePublish_1.usePublish)();
    return ((0, jsx_runtime_1.jsxs)(dialog_1.Dialog, { open: isOpen, onOpenChange: setIsOpen, children: [(0, jsx_runtime_1.jsx)(dialog_1.DialogTrigger, { asChild: true, children: (keys === null || keys === void 0 ? void 0 : keys.npub) && ((0, jsx_runtime_1.jsx)(button_1.Button, { type: "button", variant: "ghost", size: "icon", children: (0, jsx_runtime_1.jsx)(lucide_react_1.SendIcon, {}) })) }), (0, jsx_runtime_1.jsxs)(dialog_1.DialogContent, { className: "border-accent h-[85%] max-h-[50rem] w-[90%] max-w-[40rem] overflow-hidden overflow-y-scroll border select-none", children: [(0, jsx_runtime_1.jsxs)(dialog_1.DialogHeader, { children: [((_a = note.data) === null || _a === void 0 ? void 0 : _a.identifier) ? ((0, jsx_runtime_1.jsx)(dialog_1.DialogTitle, { children: "Update Note" })) : ((0, jsx_runtime_1.jsx)(dialog_1.DialogTitle, { children: "Publish Note" })), (0, jsx_runtime_1.jsx)(dialog_1.DialogDescription, { children: "Publish to the nostr network." })] }), (0, jsx_runtime_1.jsxs)("div", { className: "mb-4 flex flex-col gap-4", children: [imageUrl && ((0, jsx_runtime_1.jsx)("div", { className: "max-w-md rounded-md", children: (0, jsx_runtime_1.jsx)("img", { src: imageUrl, alt: "preview", className: "border-accent h-auto w-auto rounded-md border object-contain" }) })), (0, jsx_runtime_1.jsxs)("div", { className: "space-y-4", children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h3", { className: "mb-2 font-semibold", children: "Image URL:" }), (0, jsx_runtime_1.jsx)(input_1.Input, { type: "url", placeholder: "Enter image URL", value: imageUrl, onChange: (e) => setImageUrl(e.target.value), className: "w-full" })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h3", { className: "mb-2 font-semibold", children: "Title:" }), (0, jsx_runtime_1.jsx)("p", { className: "no-scrollbar bg-accent cursor-default overflow-x-auto rounded-md px-2 py-1", children: (_b = note.data) === null || _b === void 0 ? void 0 : _b.title })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h3", { className: "mb-2 font-semibold", children: "Author:" }), (0, jsx_runtime_1.jsx)("p", { className: "no-scrollbar bg-accent cursor-default overflow-x-auto rounded-md px-2 py-1", children: keys === null || keys === void 0 ? void 0 : keys.npub })] }), (0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("h3", { className: "mb-2 font-semibold", children: "Tags:" }), (0, jsx_runtime_1.jsx)("div", { className: "flex flex-wrap gap-2", children: (_c = note.data) === null || _c === void 0 ? void 0 : _c.tags.map((tag, index) => ((0, jsx_runtime_1.jsx)(badge_1.Badge, { className: "cursor-default", variant: "accent", children: tag }, index))) })] })] })] }), (0, jsx_runtime_1.jsxs)(dialog_1.DialogFooter, { children: [(0, jsx_runtime_1.jsx)(button_1.Button, { variant: "outline", onClick: () => setIsOpen(false), children: "Cancel" }), (0, jsx_runtime_1.jsx)(button_1.Button, { onClick: (e) => handlePublish(e, note.data, keys, imageUrl || undefined, () => setIsOpen(false)), children: "Publish" })] })] })] }));
}
//# sourceMappingURL=PublishDialog.js.map