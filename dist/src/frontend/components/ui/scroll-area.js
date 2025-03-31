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
exports.ScrollArea = ScrollArea;
exports.ScrollBar = ScrollBar;
const jsx_runtime_1 = require("react/jsx-runtime");
const ScrollAreaPrimitive = __importStar(require("@radix-ui/react-scroll-area"));
const utils_1 = require("~/lib/utils");
function ScrollArea(_a) {
    var { className, children } = _a, props = __rest(_a, ["className", "children"]);
    return ((0, jsx_runtime_1.jsxs)(ScrollAreaPrimitive.Root, Object.assign({ "data-slot": "scroll-area", className: (0, utils_1.cn)("relative", className) }, props, { children: [(0, jsx_runtime_1.jsx)(ScrollAreaPrimitive.Viewport, { "data-slot": "scroll-area-viewport", className: "ring-ring/10 dark:ring-ring/20 dark:outline-ring/40 outline-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] focus-visible:ring-4 focus-visible:outline-1", children: children }), (0, jsx_runtime_1.jsx)(ScrollBar, {}), (0, jsx_runtime_1.jsx)(ScrollAreaPrimitive.Corner, {})] })));
}
function ScrollBar(_a) {
    var { className, orientation = "vertical" } = _a, props = __rest(_a, ["className", "orientation"]);
    return ((0, jsx_runtime_1.jsx)(ScrollAreaPrimitive.ScrollAreaScrollbar, Object.assign({ "data-slot": "scroll-area-scrollbar", orientation: orientation, className: (0, utils_1.cn)("flex touch-none p-px transition-colors select-none", orientation === "vertical" &&
            "h-full w-2.5 border-l border-l-transparent", orientation === "horizontal" &&
            "h-2.5 flex-col border-t border-t-transparent", className) }, props, { children: (0, jsx_runtime_1.jsx)(ScrollAreaPrimitive.ScrollAreaThumb, { "data-slot": "scroll-area-thumb", className: "bg-border relative flex-1 rounded-full" }) })));
}
//# sourceMappingURL=scroll-area.js.map