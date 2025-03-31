"use strict";
"use client";
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
exports.SyncSettings = SyncSettings;
const jsx_runtime_1 = require("react/jsx-runtime");
const zod_1 = require("@hookform/resolvers/zod");
const react_query_1 = require("@tanstack/react-query");
const button_1 = require("~/components/ui/button");
const form_1 = require("~/components/ui/form");
const input_1 = require("~/components/ui/input");
const radio_group_1 = require("~/components/ui/radio-group");
const scroll_area_old_1 = require("~/components/ui/scroll-area-old");
const react_hook_form_1 = require("react-hook-form");
const sonner_1 = require("sonner");
const zod_2 = require("zod");
const FormSchema = zod_2.z.discriminatedUnion("syncMethod", [
    zod_2.z.object({
        syncMethod: zod_2.z.literal("no_sync"),
        url: zod_2.z.string().optional(),
    }),
    zod_2.z.object({
        syncMethod: zod_2.z.literal("custom_sync"),
        url: zod_2.z.string().min(2, "URL must be at least 2 characters."),
    }),
]);
function SyncSettings({ syncConfig }) {
    var _a, _b;
    const queryClient = (0, react_query_1.useQueryClient)();
    const form = (0, react_hook_form_1.useForm)({
        resolver: (0, zod_1.zodResolver)(FormSchema),
        defaultValues: {
            url: (_a = syncConfig === null || syncConfig === void 0 ? void 0 : syncConfig.remote.url) !== null && _a !== void 0 ? _a : "",
            syncMethod: (_b = syncConfig === null || syncConfig === void 0 ? void 0 : syncConfig.method) !== null && _b !== void 0 ? _b : "no_sync",
        },
    });
    function onSubmit(data) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(data);
            if (data.syncMethod === "no_sync") {
                yield window.api.cancelSync();
                yield queryClient.invalidateQueries({ queryKey: ["syncConfig"] });
                (0, sonner_1.toast)("Success", {
                    description: "Sync settings saved.",
                });
                return;
            }
            else if (data.syncMethod === "custom_sync") {
                if (!data.url) {
                    (0, sonner_1.toast)("Error", {
                        description: "URL is required.",
                    });
                    return;
                }
                yield window.api.syncDb(data.url);
                yield queryClient.invalidateQueries({ queryKey: ["syncConfig"] });
            }
        });
    }
    return ((0, jsx_runtime_1.jsx)("div", { className: "flex flex-col space-y-4", children: (0, jsx_runtime_1.jsxs)(scroll_area_old_1.ScrollArea, { type: "scroll", children: [(0, jsx_runtime_1.jsx)("h1", { className: "border-accent mx-12 border-b py-4 text-lg font-bold", children: "Sync" }), (0, jsx_runtime_1.jsx)("div", { className: "mx-12 my-4 flex h-full flex-col space-y-8 py-4", children: (0, jsx_runtime_1.jsx)(form_1.Form, Object.assign({}, form, { children: (0, jsx_runtime_1.jsxs)("form", { onSubmit: form.handleSubmit(onSubmit), className: "w-2/3 space-y-6", children: [(0, jsx_runtime_1.jsx)(form_1.FormField, { control: form.control, name: "syncMethod", render: ({ field }) => ((0, jsx_runtime_1.jsxs)(form_1.FormItem, { className: "space-y-3", children: [(0, jsx_runtime_1.jsx)(form_1.FormLabel, { children: "Choose a sync method" }), (0, jsx_runtime_1.jsx)(form_1.FormControl, { children: (0, jsx_runtime_1.jsxs)(radio_group_1.RadioGroup, { onValueChange: field.onChange, defaultValue: field.value, className: "flex flex-col space-y-1", children: [(0, jsx_runtime_1.jsxs)(form_1.FormItem, { className: "flex items-center space-y-0 space-x-3", children: [(0, jsx_runtime_1.jsx)(form_1.FormControl, { children: (0, jsx_runtime_1.jsx)(radio_group_1.RadioGroupItem, { value: "no_sync" }) }), (0, jsx_runtime_1.jsx)(form_1.FormLabel, { className: "font-normal", children: "Don't Sync" })] }), (0, jsx_runtime_1.jsxs)(form_1.FormItem, { className: "flex items-center space-y-0 space-x-3", children: [(0, jsx_runtime_1.jsx)(form_1.FormControl, { children: (0, jsx_runtime_1.jsx)(radio_group_1.RadioGroupItem, { value: "custom_sync" }) }), (0, jsx_runtime_1.jsx)(form_1.FormLabel, { className: "font-normal", children: "Custom Sync" })] })] }) }), (0, jsx_runtime_1.jsx)(form_1.FormMessage, {})] })) }), form.watch("syncMethod") === "custom_sync" && ((0, jsx_runtime_1.jsx)(form_1.FormField, { control: form.control, name: "url", render: ({ field }) => ((0, jsx_runtime_1.jsxs)(form_1.FormItem, { children: [(0, jsx_runtime_1.jsx)(form_1.FormLabel, { children: "Database URL" }), (0, jsx_runtime_1.jsx)(form_1.FormControl, { children: (0, jsx_runtime_1.jsx)(input_1.Input, Object.assign({ placeholder: "http(s)://user:password@hostname/database" }, field)) }), (0, jsx_runtime_1.jsx)(form_1.FormDescription, { children: "URL for CouchDB database." }), (0, jsx_runtime_1.jsx)(form_1.FormMessage, {})] })) })), (0, jsx_runtime_1.jsx)(button_1.Button, { type: "submit", children: "Submit" })] }) })) })] }) }));
}
//# sourceMappingURL=SyncSettings.js.map