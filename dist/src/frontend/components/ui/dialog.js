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
exports.Dialog = Dialog;
exports.DialogClose = DialogClose;
exports.DialogContent = DialogContent;
exports.DialogDescription = DialogDescription;
exports.DialogFooter = DialogFooter;
exports.DialogHeader = DialogHeader;
exports.DialogOverlay = DialogOverlay;
exports.DialogPortal = DialogPortal;
exports.DialogTitle = DialogTitle;
exports.DialogTrigger = DialogTrigger;
const jsx_runtime_1 = require("react/jsx-runtime");
const DialogPrimitive = __importStar(require("@radix-ui/react-dialog"));
const utils_1 = require("~/lib/utils");
const lucide_react_1 = require("lucide-react");
function Dialog(_a) {
    var props = __rest(_a, []);
    return (0, jsx_runtime_1.jsx)(DialogPrimitive.Root, Object.assign({ "data-slot": "dialog" }, props));
}
function DialogTrigger(_a) {
    var props = __rest(_a, []);
    return (0, jsx_runtime_1.jsx)(DialogPrimitive.Trigger, Object.assign({ "data-slot": "dialog-trigger" }, props));
}
function DialogPortal(_a) {
    var props = __rest(_a, []);
    return (0, jsx_runtime_1.jsx)(DialogPrimitive.Portal, Object.assign({ "data-slot": "dialog-portal" }, props));
}
function DialogClose(_a) {
    var props = __rest(_a, []);
    return (0, jsx_runtime_1.jsx)(DialogPrimitive.Close, Object.assign({ "data-slot": "dialog-close" }, props));
}
function DialogOverlay(_a) {
    var { className } = _a, props = __rest(_a, ["className"]);
    return ((0, jsx_runtime_1.jsx)(DialogPrimitive.Overlay, Object.assign({ "data-slot": "dialog-overlay", className: (0, utils_1.cn)("non-draggable data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/30", className) }, props)));
}
function DialogContent(_a) {
    var { className, children } = _a, props = __rest(_a, ["className", "children"]);
    return ((0, jsx_runtime_1.jsxs)(DialogPortal, { "data-slot": "dialog-portal", children: [(0, jsx_runtime_1.jsx)(DialogOverlay, {}), (0, jsx_runtime_1.jsxs)(DialogPrimitive.Content, Object.assign({ "data-slot": "dialog-content", 
                // max-w-[calc(100%-2rem)]
                className: (0, utils_1.cn)("non-draggable bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border border-accent p-6 shadow-lg duration-200 max-w-lg", className) }, props, { children: [children, (0, jsx_runtime_1.jsxs)(DialogPrimitive.Close, { className: "non-draggable ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.XIcon, {}), (0, jsx_runtime_1.jsx)("span", { className: "sr-only", children: "Close" })] })] }))] }));
}
function DialogHeader(_a) {
    var { className } = _a, props = __rest(_a, ["className"]);
    return ((0, jsx_runtime_1.jsx)("div", Object.assign({ "data-slot": "dialog-header", className: (0, utils_1.cn)("flex flex-col gap-2 text-center sm:text-left", className) }, props)));
}
function DialogFooter(_a) {
    var { className } = _a, props = __rest(_a, ["className"]);
    return ((0, jsx_runtime_1.jsx)("div", Object.assign({ "data-slot": "dialog-footer", className: (0, utils_1.cn)("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className) }, props)));
}
function DialogTitle(_a) {
    var { className } = _a, props = __rest(_a, ["className"]);
    return ((0, jsx_runtime_1.jsx)(DialogPrimitive.Title, Object.assign({ "data-slot": "dialog-title", className: (0, utils_1.cn)("text-lg leading-none font-semibold", className) }, props)));
}
function DialogDescription(_a) {
    var { className } = _a, props = __rest(_a, ["className"]);
    return ((0, jsx_runtime_1.jsx)(DialogPrimitive.Description, Object.assign({ "data-slot": "dialog-description", className: (0, utils_1.cn)("text-muted-foreground text-sm", className) }, props)));
}
//# sourceMappingURL=dialog.js.map