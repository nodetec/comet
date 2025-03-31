"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.Accordion = Accordion;
exports.AccordionItem = AccordionItem;
exports.AccordionTrigger = AccordionTrigger;
exports.AccordionContent = AccordionContent;
const jsx_runtime_1 = require("react/jsx-runtime");
const AccordionPrimitive = __importStar(require("@radix-ui/react-accordion"));
const utils_1 = require("~/lib/utils");
const lucide_react_1 = require("lucide-react");
function Accordion(_a) {
    var props = __rest(_a, []);
    return (0, jsx_runtime_1.jsx)(AccordionPrimitive.Root, Object.assign({ "data-slot": "accordion" }, props));
}
function AccordionItem(_a) {
    var { className } = _a, props = __rest(_a, ["className"]);
    return ((0, jsx_runtime_1.jsx)(AccordionPrimitive.Item, Object.assign({ "data-slot": "accordion-item", className: (0, utils_1.cn)("border-none", className) }, props)));
}
function AccordionTrigger(_a) {
    var { className, children } = _a, props = __rest(_a, ["className", "children"]);
    return ((0, jsx_runtime_1.jsx)(AccordionPrimitive.Header, { className: "flex", children: (0, jsx_runtime_1.jsxs)(AccordionPrimitive.Trigger, Object.assign({ "data-slot": "accordion-trigger", 
            // pt-0 pb-1.5
            className: (0, utils_1.cn)("text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&:hover>svg]:block [&>svg]:hidden [&[data-state=open]>svg]:rotate-180", className) }, props, { children: [children, (0, jsx_runtime_1.jsx)(lucide_react_1.ChevronDownIcon, { className: "text-muted-foreground/80 pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" })] })) }));
}
function AccordionContent(_a) {
    var { className, children } = _a, props = __rest(_a, ["className", "children"]);
    return ((0, jsx_runtime_1.jsx)(AccordionPrimitive.Content, Object.assign({ "data-slot": "accordion-content", className: "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm" }, props, { children: (0, jsx_runtime_1.jsx)("div", { className: (0, utils_1.cn)("pt-0 pb-4", className), children: children }) })));
}
//# sourceMappingURL=accordion.js.map