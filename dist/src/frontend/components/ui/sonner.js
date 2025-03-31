"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Toaster = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const next_themes_1 = require("next-themes");
const sonner_1 = require("sonner");
const Toaster = (_a) => {
    var props = __rest(_a, []);
    const { theme = "system" } = (0, next_themes_1.useTheme)();
    return ((0, jsx_runtime_1.jsx)(sonner_1.Toaster, Object.assign({ theme: theme, className: "toaster group", toastOptions: {
            classNames: {
                toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
                description: "group-[.toast]:text-muted-foreground",
                actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium",
                cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground font-medium",
            },
        } }, props)));
};
exports.Toaster = Toaster;
//# sourceMappingURL=sonner.js.map