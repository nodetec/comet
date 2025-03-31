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
exports.FormField = exports.Form = exports.useFormField = void 0;
exports.FormItem = FormItem;
exports.FormLabel = FormLabel;
exports.FormControl = FormControl;
exports.FormDescription = FormDescription;
exports.FormMessage = FormMessage;
const jsx_runtime_1 = require("react/jsx-runtime");
const React = __importStar(require("react"));
const react_slot_1 = require("@radix-ui/react-slot");
const react_hook_form_1 = require("react-hook-form");
const utils_1 = require("~/lib/utils");
const label_1 = require("~/components/ui/label");
const Form = react_hook_form_1.FormProvider;
exports.Form = Form;
const FormFieldContext = React.createContext({});
const FormField = (_a) => {
    var props = __rest(_a, []);
    return ((0, jsx_runtime_1.jsx)(FormFieldContext.Provider, { value: { name: props.name }, children: (0, jsx_runtime_1.jsx)(react_hook_form_1.Controller, Object.assign({}, props)) }));
};
exports.FormField = FormField;
const useFormField = () => {
    const fieldContext = React.useContext(FormFieldContext);
    const itemContext = React.useContext(FormItemContext);
    const { getFieldState } = (0, react_hook_form_1.useFormContext)();
    const formState = (0, react_hook_form_1.useFormState)({ name: fieldContext.name });
    const fieldState = getFieldState(fieldContext.name, formState);
    if (!fieldContext) {
        throw new Error("useFormField should be used within <FormField>");
    }
    const { id } = itemContext;
    return Object.assign({ id, name: fieldContext.name, formItemId: `${id}-form-item`, formDescriptionId: `${id}-form-item-description`, formMessageId: `${id}-form-item-message` }, fieldState);
};
exports.useFormField = useFormField;
const FormItemContext = React.createContext({});
function FormItem(_a) {
    var { className } = _a, props = __rest(_a, ["className"]);
    const id = React.useId();
    return ((0, jsx_runtime_1.jsx)(FormItemContext.Provider, { value: { id }, children: (0, jsx_runtime_1.jsx)("div", Object.assign({ "data-slot": "form-item", className: (0, utils_1.cn)("grid gap-2", className) }, props)) }));
}
function FormLabel(_a) {
    var { className } = _a, props = __rest(_a, ["className"]);
    const { error, formItemId } = useFormField();
    return ((0, jsx_runtime_1.jsx)(label_1.Label, Object.assign({ "data-slot": "form-label", "data-error": !!error, className: (0, utils_1.cn)("data-[error=true]:text-destructive", className), htmlFor: formItemId }, props)));
}
function FormControl(_a) {
    var props = __rest(_a, []);
    const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
    return ((0, jsx_runtime_1.jsx)(react_slot_1.Slot, Object.assign({ "data-slot": "form-control", id: formItemId, "aria-describedby": !error
            ? `${formDescriptionId}`
            : `${formDescriptionId} ${formMessageId}`, "aria-invalid": !!error }, props)));
}
function FormDescription(_a) {
    var { className } = _a, props = __rest(_a, ["className"]);
    const { formDescriptionId } = useFormField();
    return ((0, jsx_runtime_1.jsx)("p", Object.assign({ "data-slot": "form-description", id: formDescriptionId, className: (0, utils_1.cn)("text-muted-foreground text-sm", className) }, props)));
}
function FormMessage(_a) {
    var _b;
    var { className } = _a, props = __rest(_a, ["className"]);
    const { error, formMessageId } = useFormField();
    const body = error ? String((_b = error === null || error === void 0 ? void 0 : error.message) !== null && _b !== void 0 ? _b : "") : props.children;
    if (!body) {
        return null;
    }
    return ((0, jsx_runtime_1.jsx)("p", Object.assign({ "data-slot": "form-message", id: formMessageId, className: (0, utils_1.cn)("text-destructive text-sm", className) }, props, { children: body })));
}
//# sourceMappingURL=form.js.map