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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginDialog = LoginDialog;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const zod_1 = require("@hookform/resolvers/zod");
const button_1 = require("~/components/ui/button");
const dialog_1 = require("~/components/ui/dialog");
const form_1 = require("~/components/ui/form");
const input_1 = require("~/components/ui/input");
const store_1 = require("~/store");
const lucide_react_1 = require("lucide-react");
const nostr_tools_1 = require("nostr-tools");
const react_copy_to_clipboard_1 = __importDefault(require("react-copy-to-clipboard"));
const react_hook_form_1 = require("react-hook-form");
const zod_2 = require("zod");
const isValidNsec = (nsec) => {
    try {
        return nostr_tools_1.nip19.decode(nsec).type === "nsec";
    }
    catch (e) {
        console.error("Error decoding nsec:", e);
        return false;
    }
};
const formSchema = zod_2.z.object({
    npub: zod_2.z.string(),
    nsec: zod_2.z.string().refine(isValidNsec, {
        message: "Invalid nsec.",
    }),
});
function LoginDialog({ children }) {
    const [isDialogOpen, setIsDialogOpen] = (0, react_1.useState)(false);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [isNsecCopied, setIsNsecCopied] = (0, react_1.useState)(false);
    const [isNpubCopied, setIsNpubCopied] = (0, react_1.useState)(false);
    const setKeys = (0, store_1.useAppState)((state) => state.setKeys);
    const form = (0, react_hook_form_1.useForm)({
        resolver: (0, zod_1.zodResolver)(formSchema),
        defaultValues: {
            npub: "",
            nsec: "",
        },
    });
    const { reset, watch, setValue } = form;
    const nsecValue = watch("nsec");
    const npubValue = watch("npub");
    const generateKepair = (e) => {
        e.preventDefault();
        const secretKey = (0, nostr_tools_1.generateSecretKey)();
        const publicKey = (0, nostr_tools_1.getPublicKey)(secretKey);
        const nsec = nostr_tools_1.nip19.nsecEncode(secretKey);
        const npub = nostr_tools_1.nip19.npubEncode(publicKey);
        reset({
            nsec,
            npub,
        });
        void form.trigger(["nsec", "npub"]);
    };
    const onSubmit = (values) => __awaiter(this, void 0, void 0, function* () {
        // TODO: not sure why this doesn't work
        // if (!form.formState.isValid) {
        //   return;
        // }
        if (!isValidNsec(values.nsec)) {
            alert("Invalid nsec");
            return;
        }
        const { nsec, npub } = values;
        console.log("nsec", nsec);
        console.log("npub", npub);
        setKeys({ nsec, npub });
        setIsDialogOpen(false);
        setLoading(false);
        setIsNsecCopied(false);
        setIsNpubCopied(false);
    });
    const handleNsecOnCopy = (_, result) => {
        setLoading(true);
        if (result) {
            setIsNsecCopied(true);
            setTimeout(() => setIsNsecCopied(false), 500);
        }
        else {
            alert("Failed to copy Nsec!");
        }
        setLoading(false);
    };
    const handleNpubOnCopy = (_, result) => {
        setLoading(true);
        if (result) {
            setIsNpubCopied(true);
            setTimeout(() => setIsNpubCopied(false), 500);
        }
        else {
            alert("Failed to copy Npub!");
        }
        setLoading(false);
    };
    (0, react_1.useEffect)(() => {
        if (isValidNsec(nsecValue)) {
            const secretKey = nostr_tools_1.nip19.decode(nsecValue).data;
            const publicKey = (0, nostr_tools_1.getPublicKey)(secretKey);
            const npub = nostr_tools_1.nip19.npubEncode(publicKey);
            setValue("nsec", nsecValue, { shouldValidate: true });
            setValue("npub", npub, { shouldValidate: true });
        }
        else {
            setValue("npub", "", { shouldValidate: true });
        }
    }, [nsecValue, setValue]);
    return ((0, jsx_runtime_1.jsxs)(dialog_1.Dialog, { open: isDialogOpen, onOpenChange: setIsDialogOpen, children: [(0, jsx_runtime_1.jsx)(dialog_1.DialogTrigger, { asChild: true, children: (0, jsx_runtime_1.jsx)("div", { onClick: () => setIsDialogOpen(true), children: children }) }), (0, jsx_runtime_1.jsxs)(dialog_1.DialogContent, { "aria-describedby": "login", className: "max-w-md p-6", children: [(0, jsx_runtime_1.jsxs)(dialog_1.DialogHeader, { children: [(0, jsx_runtime_1.jsx)(dialog_1.DialogTitle, { children: "Register" }), (0, jsx_runtime_1.jsxs)(dialog_1.DialogDescription, { children: ["Don't have a Nostr account?", " ", (0, jsx_runtime_1.jsx)("button", { onClick: generateKepair, className: "text-sky-500/90 focus-visible:ring-0 focus-visible:outline-none", children: "Create keypair" })] })] }), (0, jsx_runtime_1.jsx)(form_1.Form, Object.assign({}, form, { children: (0, jsx_runtime_1.jsxs)("form", { onSubmit: form.handleSubmit(onSubmit), className: "space-y-8", children: [(0, jsx_runtime_1.jsxs)("div", { className: "flex w-full flex-col items-center justify-start gap-y-6 py-2", children: [(0, jsx_runtime_1.jsx)(form_1.FormField, { control: form.control, name: "nsec", render: ({ field }) => ((0, jsx_runtime_1.jsxs)(form_1.FormItem, { className: "flex w-full flex-col gap-2", children: [(0, jsx_runtime_1.jsx)(form_1.FormLabel, { children: "Nsec" }), (0, jsx_runtime_1.jsx)(form_1.FormControl, { children: (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-4", children: [(0, jsx_runtime_1.jsx)(input_1.Input, Object.assign({ className: "overflow-ellipsis", id: "create-dialog-nsec-input", placeholder: "nsec" }, field)), (0, jsx_runtime_1.jsx)(react_copy_to_clipboard_1.default, { text: nsecValue, onCopy: handleNsecOnCopy, children: (0, jsx_runtime_1.jsxs)(button_1.Button, { id: "create-dialog-nsec-copy-btn", name: "create-dialog-nsec-copy-btn", type: "button", variant: "outline", size: "icon", disabled: loading, children: [!isNsecCopied && (0, jsx_runtime_1.jsx)(lucide_react_1.CopyIcon, { className: "h-3 w-3" }), isNsecCopied && (0, jsx_runtime_1.jsx)(lucide_react_1.CheckIcon, { className: "h-3 w-3" })] }) })] }) }), (0, jsx_runtime_1.jsx)(form_1.FormMessage, {})] })) }), (0, jsx_runtime_1.jsx)(form_1.FormField, { control: form.control, name: "npub", render: ({ field }) => ((0, jsx_runtime_1.jsxs)(form_1.FormItem, { className: "flex w-full flex-col gap-2", children: [(0, jsx_runtime_1.jsx)(form_1.FormLabel, { children: "Npub" }), (0, jsx_runtime_1.jsx)(form_1.FormControl, { children: (0, jsx_runtime_1.jsxs)("div", { className: "flex gap-4", children: [(0, jsx_runtime_1.jsx)(input_1.Input, Object.assign({ className: "overflow-ellipsis", id: "create-dialog-npub-input", disabled: true, placeholder: "npub" }, field)), (0, jsx_runtime_1.jsx)(react_copy_to_clipboard_1.default, { text: npubValue, onCopy: handleNpubOnCopy, children: (0, jsx_runtime_1.jsxs)(button_1.Button, { id: "create-dialog-npub-copy-btn", name: "create-dialog-nub-copy-btn", type: "button", variant: "outline", size: "icon", disabled: loading, children: [!isNpubCopied && (0, jsx_runtime_1.jsx)(lucide_react_1.CopyIcon, { className: "h-3 w-3" }), isNpubCopied && (0, jsx_runtime_1.jsx)(lucide_react_1.CheckIcon, { className: "h-3 w-3" })] }) })] }) }), (0, jsx_runtime_1.jsx)(form_1.FormMessage, {})] })) })] }), (0, jsx_runtime_1.jsx)(dialog_1.DialogFooter, { children: (0, jsx_runtime_1.jsx)(button_1.Button, { id: "create-dialog-create-btn", name: "create-dialog-create-btn", type: "submit", className: "max-w-[18%]", variant: "default", children: "Login" }) })] }) }))] })] }));
}
//# sourceMappingURL=LoginDialog.js.map