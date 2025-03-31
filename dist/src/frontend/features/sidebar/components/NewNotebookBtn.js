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
exports.NewNotebookBtn = NewNotebookBtn;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
// import { type CheckedState } from "@radix-ui/react-checkbox";
const react_query_1 = require("@tanstack/react-query");
const button_1 = require("~/components/ui/button");
// import { Checkbox } from "~/components/ui/checkbox";
const dialog_1 = require("~/components/ui/dialog");
const input_1 = require("~/components/ui/input");
const store_1 = require("~/store");
const lucide_react_1 = require("lucide-react");
const sonner_1 = require("sonner");
function NewNotebookBtn() {
    const [name, setName] = (0, react_1.useState)("");
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    const queryClient = (0, react_query_1.useQueryClient)();
    const setNoteSearch = (0, store_1.useAppState)((state) => state.setNoteSearch);
    const handleCreate = () => __awaiter(this, void 0, void 0, function* () {
        console.log({ name });
        if (name.trim() === "") {
            return;
        }
        const trimmedName = name.trim();
        try {
            yield window.api.createNotebook(trimmedName);
            yield queryClient.invalidateQueries({ queryKey: ["notebooks"] });
            setIsOpen(false);
            setName("");
            setNoteSearch("");
        }
        catch (error) {
            console.error(error);
            sonner_1.toast.error("Notebook already exists");
        }
        setIsOpen(false);
        setName(""); // Clear the input field
    });
    return ((0, jsx_runtime_1.jsxs)(dialog_1.Dialog, { open: isOpen, onOpenChange: setIsOpen, children: [(0, jsx_runtime_1.jsx)(dialog_1.DialogTrigger, { asChild: true, children: (0, jsx_runtime_1.jsxs)(button_1.Button, { className: "flex justify-start gap-2 text-sm hover:bg-transparent [&_svg]:size-[1rem]", variant: "ghost", children: [(0, jsx_runtime_1.jsx)(lucide_react_1.PlusCircleIcon, {}), "Notebook"] }) }), (0, jsx_runtime_1.jsxs)(dialog_1.DialogContent, { children: [(0, jsx_runtime_1.jsxs)(dialog_1.DialogHeader, { children: [(0, jsx_runtime_1.jsx)(dialog_1.DialogTitle, { children: "New Notebook" }), (0, jsx_runtime_1.jsx)(dialog_1.DialogDescription, { children: "Create a new notebook to organize your notes" })] }), (0, jsx_runtime_1.jsx)("div", { className: "space-y-4", children: (0, jsx_runtime_1.jsx)(input_1.Input, { className: "focus-visible:ring-blue-400/80", placeholder: "Notebook Name", value: name, onChange: (e) => setName(e.target.value), onKeyDown: (e) => {
                                if (e.key === "Enter") {
                                    void handleCreate();
                                }
                            }, autoFocus: true }) }), (0, jsx_runtime_1.jsx)(dialog_1.DialogFooter, { children: (0, jsx_runtime_1.jsx)(button_1.Button, { onClick: handleCreate, children: "Create" }) })] })] }));
}
//# sourceMappingURL=NewNotebookBtn.js.map