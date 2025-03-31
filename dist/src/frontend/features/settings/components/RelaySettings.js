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
exports.RelaySettings = RelaySettings;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const zod_1 = require("@hookform/resolvers/zod");
const button_1 = require("~/components/ui/button");
const form_1 = require("~/components/ui/form");
const input_1 = require("~/components/ui/input");
const scroll_area_old_1 = require("~/components/ui/scroll-area-old");
const store_1 = require("~/store");
const lucide_react_1 = require("lucide-react");
const react_hook_form_1 = require("react-hook-form");
const sonner_1 = require("sonner");
const zod_2 = require("zod");
const nostrFormSchema = zod_2.z.object({
    relays: zod_2.z.array(zod_2.z.object({
        url: zod_2.z
            .string()
            .max(100, { message: "Must be 100 or fewer characters long" })
            .trim()
            .toLowerCase()
            .url({ message: "Please enter a valid URL." })
            .refine((url) => url.startsWith("wss://"), {
            message: "URL must begin with wss://",
        }),
        read: zod_2.z.boolean(),
        write: zod_2.z.boolean(),
    })),
});
function RelaySettings({ relays }) {
    const [loading, setLoading] = (0, react_1.useState)(false);
    const setRelays = (0, store_1.useAppState)((state) => state.setRelays);
    const defaultRelay = {
        relays: [
            {
                url: "wss://relay.damus.io",
                read: false,
                write: true,
            },
        ],
    };
    const form = (0, react_hook_form_1.useForm)({
        resolver: (0, zod_1.zodResolver)(nostrFormSchema),
        defaultValues: {
            relays: relays.length > 0 ? relays : defaultRelay.relays,
        },
        mode: "onChange",
    });
    const { fields, append, remove } = (0, react_hook_form_1.useFieldArray)({
        name: "relays",
        control: form.control,
    });
    function removeRelay(e, index) {
        e.preventDefault();
        if (fields.length === 1)
            return;
        remove(index);
    }
    function appendRelay(e) {
        e.preventDefault();
        // check if the last relay has a URL using form's getValues method
        const values = form.getValues();
        const lastRelay = values.relays[values.relays.length - 1];
        if (!(lastRelay === null || lastRelay === void 0 ? void 0 : lastRelay.url))
            return;
        append({ url: "", read: false, write: true });
    }
    // TODO
    // Handle if there are zero relays
    // zod might be able to check if a value is unique
    // Then add all relays instead of one relay at a time to the db - Create an add all service
    function onSubmit(data) {
        return __awaiter(this, void 0, void 0, function* () {
            setLoading(true);
            try {
                setRelays(data.relays);
                (0, sonner_1.toast)("Success", {
                    description: "Relays updated",
                });
            }
            catch (error) {
                console.error("Nostr settings error: ", error);
            }
            finally {
                setLoading(false);
            }
        });
    }
    return ((0, jsx_runtime_1.jsx)("div", { className: "flex flex-col space-y-4", children: (0, jsx_runtime_1.jsxs)(scroll_area_old_1.ScrollArea, { type: "scroll", children: [(0, jsx_runtime_1.jsx)("h1", { className: "border-accent mx-12 border-b py-4 text-lg font-bold", children: "Relays" }), (0, jsx_runtime_1.jsx)("div", { className: "mx-12 my-4 h-full py-4", children: (0, jsx_runtime_1.jsx)(form_1.Form, Object.assign({}, form, { children: (0, jsx_runtime_1.jsx)("form", { onSubmit: form.handleSubmit(onSubmit), className: "max-w-md space-y-8", children: (0, jsx_runtime_1.jsxs)("div", { children: [fields.map((field, index) => ((0, jsx_runtime_1.jsx)(form_1.FormField, { control: form.control, name: `relays.${index}.url`, render: ({ field }) => ((0, jsx_runtime_1.jsxs)(form_1.FormItem, { className: "pb-4", children: [(0, jsx_runtime_1.jsx)(form_1.FormControl, { children: (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-4", children: [(0, jsx_runtime_1.jsx)(input_1.Input, Object.assign({}, field, { className: "disabled:cursor-text disabled:opacity-100", disabled: loading })), (0, jsx_runtime_1.jsx)(button_1.Button, { type: "button", variant: "outline", className: "h-9 self-end rounded-md bg-transparent px-3 text-xs disabled:cursor-pointer disabled:opacity-100", disabled: loading, onClick: (e) => removeRelay(e, index), children: (0, jsx_runtime_1.jsx)(lucide_react_1.X, { className: "h-4 w-4" }) })] }) }), (0, jsx_runtime_1.jsx)(form_1.FormMessage, {})] })) }, field.id))), (0, jsx_runtime_1.jsxs)("div", { className: "mt-2 flex items-center gap-4", children: [(0, jsx_runtime_1.jsxs)(button_1.Button, { id: "nostr-settings-add-relay-btn", name: "nostr-settings-add-relay-btn", type: "button", variant: "outline", size: "sm", className: "disabled:cursor-pointer disabled:opacity-100", disabled: loading, onClick: (e) => appendRelay(e), children: [(0, jsx_runtime_1.jsx)(lucide_react_1.PlusIcon, {}), "Relay"] }), (0, jsx_runtime_1.jsx)(button_1.Button, { id: "nostr-settings-submit-relay-btn", name: "nostr-settings-submit-relay-btn", type: "submit", variant: "default", size: "sm", className: "disabled:cursor-pointer disabled:opacity-100", disabled: loading, children: "Save" })] })] }) }) })) })] }) }));
}
//# sourceMappingURL=RelaySettings.js.map