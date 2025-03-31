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
exports.ProfileSettings = ProfileSettings;
const jsx_runtime_1 = require("react/jsx-runtime");
const button_1 = require("~/components/ui/button");
const scroll_area_old_1 = require("~/components/ui/scroll-area-old");
const nostr_1 = require("~/lib/nostr");
const store_1 = require("~/store");
const LoginDialog_1 = require("./LoginDialog");
function ProfileSettings() {
    const keys = (0, store_1.useAppState)((state) => state.keys);
    const setKeys = (0, store_1.useAppState)((state) => state.setKeys);
    const handleLogout = (e) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        setKeys(undefined);
    });
    return ((0, jsx_runtime_1.jsx)("div", { className: "flex flex-col space-y-4", children: (0, jsx_runtime_1.jsxs)(scroll_area_old_1.ScrollArea, { type: "scroll", children: [(0, jsx_runtime_1.jsx)("h1", { className: "border-accent mx-12 border-b py-4 text-lg font-bold", children: "Profile" }), (0, jsx_runtime_1.jsx)("div", { className: "mx-12 my-4 h-full py-4", children: (0, jsx_runtime_1.jsxs)("div", { className: "border-accent flex gap-4 items-center justify-between border-b pb-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex flex-col", children: [(0, jsx_runtime_1.jsx)("h3", { className: "text-lg font-semibold", children: "Account" }), (0, jsx_runtime_1.jsx)("p", { className: "text-muted-foreground text-sm", children: (keys === null || keys === void 0 ? void 0 : keys.npub)
                                            ? `You are currently logged in as ${(0, nostr_1.shortNpub)(keys.npub)}`
                                            : "You are not currently logged in" })] }), (0, jsx_runtime_1.jsx)("div", { className: "flex items-center space-x-2 ", children: (keys === null || keys === void 0 ? void 0 : keys.npub) ? ((0, jsx_runtime_1.jsx)(button_1.Button, { variant: "default", onClick: handleLogout, children: "Logout" })) : ((0, jsx_runtime_1.jsx)(LoginDialog_1.LoginDialog, { children: (0, jsx_runtime_1.jsx)(button_1.Button, { variant: "default", children: "Login" }) })) })] }) })] }) }));
}
//# sourceMappingURL=ProfileSettings.js.map