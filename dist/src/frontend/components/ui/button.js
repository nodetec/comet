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
exports.buttonVariants = void 0;
exports.Button = Button;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_slot_1 = require("@radix-ui/react-slot");
const class_variance_authority_1 = require("class-variance-authority");
const utils_1 = require("~/lib/utils");
const buttonVariants = (0, class_variance_authority_1.cva)("non-draggable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-[1.2rem] [&_svg]:shrink-0 cursor-default", {
    variants: {
        variant: {
            default: "bg-primary/60 text-primary-foreground shadow-xs hover:bg-primary/70",
            destructive: "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
            outline: "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
            secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
            ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-blue-500/50",
            sidebar: "text-secondary-foreground  hover:bg-accent hover:text-accent-foreground",
            link: "text-primary underline-offset-4 hover:underline",
        },
        size: {
            default: "h-9 px-4 py-2 has-[>svg]:px-3",
            sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
            lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
            icon: "size-9",
        },
    },
    defaultVariants: {
        variant: "default",
        size: "default",
    },
});
exports.buttonVariants = buttonVariants;
function Button(_a) {
    var { className, variant, size, asChild = false } = _a, props = __rest(_a, ["className", "variant", "size", "asChild"]);
    const Comp = asChild ? react_slot_1.Slot : "button";
    return ((0, jsx_runtime_1.jsx)(Comp, Object.assign({ "data-slot": "button", className: (0, utils_1.cn)(buttonVariants({ variant, size, className })) }, props)));
}
//# sourceMappingURL=button.js.map