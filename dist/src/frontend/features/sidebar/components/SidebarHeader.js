"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarHeader = SidebarHeader;
const jsx_runtime_1 = require("react/jsx-runtime");
const button_1 = require("~/components/ui/button");
const settings_1 = require("~/features/settings");
const store_1 = require("~/store");
const lucide_react_1 = require("lucide-react");
function SidebarHeader() {
    const setSettingsTab = (0, store_1.useAppState)((state) => state.setSettingsTab);
    function handleClick() {
        setSettingsTab("profile");
    }
    function handleDoubleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("double click");
        void window.api.toggleMaximize();
    }
    return ((0, jsx_runtime_1.jsxs)("header", { className: "draggable flex justify-end gap-1 px-4 pt-2 pb-4", onDoubleClick: handleDoubleClick, children: [(0, jsx_runtime_1.jsx)(settings_1.Settings, { children: (0, jsx_runtime_1.jsx)(button_1.Button, { onClick: handleClick, onDoubleClick: (e) => e.stopPropagation(), type: "button", variant: "ghost", size: "icon", children: (0, jsx_runtime_1.jsx)(lucide_react_1.UserCircleIcon, {}) }) }), (0, jsx_runtime_1.jsx)(settings_1.Settings, { children: (0, jsx_runtime_1.jsx)(button_1.Button, { type: "button", variant: "ghost", size: "icon", children: (0, jsx_runtime_1.jsx)(lucide_react_1.Settings2Icon, {}) }) })] }));
}
//# sourceMappingURL=SidebarHeader.js.map