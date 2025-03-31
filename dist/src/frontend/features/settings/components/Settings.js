"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Settings = Settings;
const jsx_runtime_1 = require("react/jsx-runtime");
const dialog_1 = require("~/components/ui/dialog");
const useSyncConfig_1 = require("~/hooks/useSyncConfig");
const store_1 = require("~/store");
const NotebookSettings_1 = require("./NotebookSettings");
const ProfileSettings_1 = require("./ProfileSettings");
const RelaySettings_1 = require("./RelaySettings");
const SyncSettings_1 = require("./SyncSettings");
function Settings({ children }) {
    const settingsTab = (0, store_1.useAppState)((state) => state.settingsTab);
    const setSettingsTab = (0, store_1.useAppState)((state) => state.setSettingsTab);
    const relays = (0, store_1.useAppState)((state) => state.relays);
    const syncConfig = (0, useSyncConfig_1.useSyncConfig)();
    return ((0, jsx_runtime_1.jsxs)(dialog_1.Dialog, { children: [(0, jsx_runtime_1.jsx)(dialog_1.DialogTrigger, { onDoubleClick: (e) => e.stopPropagation(), asChild: true, children: children }), (0, jsx_runtime_1.jsx)(dialog_1.DialogTitle, { className: "hidden", children: "Settings" }), (0, jsx_runtime_1.jsxs)(dialog_1.DialogContent, { "aria-describedby": "settings", className: "non-draggable border-accent flex h-[85%] max-h-[60rem] w-[90%] max-w-[70rem] overflow-hidden border p-0 select-none", children: [(0, jsx_runtime_1.jsxs)("div", { className: "bg-sidebar text-muted-foreground flex min-h-full max-w-64 min-w-64 flex-col gap-y-2 overflow-hidden border-r pt-6 pr-4 pl-4 text-sm", children: [(0, jsx_runtime_1.jsx)("span", { className: `text-secondary-foreground flex items-center rounded-md px-2 py-1.5 text-sm font-medium ${settingsTab === "profile" && "bg-accent/80 text-secondary-foreground"}`, onClick: () => setSettingsTab("profile"), children: "Profile" }), (0, jsx_runtime_1.jsx)("span", { className: `text-secondary-foreground flex items-center rounded-md px-2 py-1.5 text-sm font-medium ${settingsTab === "relays" && "bg-accent/80 text-secondary-foreground"}`, onClick: () => setSettingsTab("relays"), children: "Relays" }), (0, jsx_runtime_1.jsx)("span", { className: `text-secondary-foreground flex items-center rounded-md px-2 py-1.5 text-sm font-medium ${settingsTab === "notebooks" && "bg-accent/80 text-secondary-foreground"}`, onClick: () => setSettingsTab("notebooks"), children: "Notebooks" }), (0, jsx_runtime_1.jsx)("span", { className: `text-secondary-foreground flex items-center rounded-md px-2 py-1.5 text-sm font-medium ${settingsTab === "sync" && "bg-accent/80 text-secondary-foreground"}`, onClick: () => setSettingsTab("sync"), children: "Sync" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "flex w-full flex-col", children: [settingsTab === "profile" && (0, jsx_runtime_1.jsx)(ProfileSettings_1.ProfileSettings, {}), settingsTab === "notebooks" && (0, jsx_runtime_1.jsx)(NotebookSettings_1.NotebookSettings, {}), settingsTab === "relays" && relays && ((0, jsx_runtime_1.jsx)(RelaySettings_1.RelaySettings, { relays: relays })), settingsTab === "sync" && ((0, jsx_runtime_1.jsx)(SyncSettings_1.SyncSettings, { syncConfig: syncConfig.data }))] })] })] }));
}
//# sourceMappingURL=Settings.js.map