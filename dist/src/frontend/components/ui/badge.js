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
exports.badgeVariants = void 0;
exports.Badge = Badge;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_slot_1 = require("@radix-ui/react-slot");
const class_variance_authority_1 = require("class-variance-authority");
const utils_1 = require("~/lib/utils");
const badgeVariants = (0, class_variance_authority_1.cva)("inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden", {
    variants: {
        variant: {
            default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
            secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
            accent: "border-transparent bg-accent text-accent-foreground [a&]:hover:bg-accent/90",
            destructive: "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
            outline: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        },
    },
    defaultVariants: {
        variant: "default",
    },
});
exports.badgeVariants = badgeVariants;
function Badge(_a) {
    var { className, variant, asChild = false } = _a, props = __rest(_a, ["className", "variant", "asChild"]);
    const Comp = asChild ? react_slot_1.Slot : "span";
    return ((0, jsx_runtime_1.jsx)(Comp, Object.assign({ "data-slot": "badge", className: (0, utils_1.cn)(badgeVariants({ variant }), className) }, props)));
}
//# sourceMappingURL=badge.js.map