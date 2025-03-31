"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarButton = SidebarButton;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importDefault(require("react"));
const utils_1 = require("~/lib/utils");
function SidebarButton({ onClick, onContextMenu, isFocused, isActive, icon, label, }) {
    return ((0, jsx_runtime_1.jsxs)("div", { onClick: onClick, onContextMenu: onContextMenu, "data-focused": isFocused, className: (0, utils_1.cn)("text-secondary-foreground flex w-full items-center rounded-md px-3 py-1 text-sm select-none", isActive && "bg-accent/80", "cursor-default data-[focused=true]:bg-primary/30"), children: [react_1.default.cloneElement(icon, {
                className: (0, utils_1.cn)("h-4 w-4 text-primary shrink-0", isActive && "data-[focused=true]:text-secondary-foreground"),
            }), (0, jsx_runtime_1.jsx)("div", { className: "ml-2 line-clamp-1 truncate break-all overflow-ellipsis whitespace-break-spaces", children: label })] }));
}
//# sourceMappingURL=SidebarButton.js.map