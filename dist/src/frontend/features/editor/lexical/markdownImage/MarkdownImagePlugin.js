"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INSERT_IMAGE_COMMAND = void 0;
exports.MarkdownImagePlugin = MarkdownImagePlugin;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const button_1 = require("~/components/ui/button");
const dialog_1 = require("~/components/ui/dialog");
const input_1 = require("~/components/ui/input");
const label_1 = require("~/components/ui/label");
const lexical_1 = require("lexical");
const lucide_react_1 = require("lucide-react");
const useImageInsertCommand_1 = require("./hooks/useImageInsertCommand");
const useMarkdownImagePaste_1 = require("./hooks/useMarkdownImagePaste");
const MarkdownImageNode_1 = require("./nodes/MarkdownImageNode");
var useImageInsertCommand_2 = require("./hooks/useImageInsertCommand");
Object.defineProperty(exports, "INSERT_IMAGE_COMMAND", { enumerable: true, get: function () { return useImageInsertCommand_2.INSERT_IMAGE_COMMAND; } });
function MarkdownImagePlugin() {
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    (0, useImageInsertCommand_1.useImageInsertCommand)(editor);
    (0, useMarkdownImagePaste_1.useMarkdownImagePaste)(editor);
    const [src, setSrc] = (0, react_1.useState)("");
    const [altText, setAltText] = (0, react_1.useState)("");
    const [imageFile, setImageFile] = (0, react_1.useState)(null);
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    const handleInsertImage = (0, react_1.useCallback)(() => {
        if (imageFile) {
            // Simple file upload without resizing
            const reader = new FileReader();
            reader.onload = (e) => {
                var _a;
                const dataUrl = (_a = e.target) === null || _a === void 0 ? void 0 : _a.result;
                editor.update(() => {
                    const imageNode = (0, MarkdownImageNode_1.$createMarkdownImageNode)({
                        src: dataUrl,
                        altText,
                    });
                    // Create a paragraph node after for better editing experience
                    const paragraphAfter = (0, lexical_1.$createParagraphNode)();
                    // Insert nodes
                    (0, lexical_1.$insertNodes)([imageNode, paragraphAfter]);
                });
                // Reset state
                setImageFile(null);
                setAltText("");
                setSrc("");
                setIsOpen(false);
            };
            reader.readAsDataURL(imageFile);
        }
        else if (src) {
            // For URLs
            editor.update(() => {
                const imageNode = (0, MarkdownImageNode_1.$createMarkdownImageNode)({
                    src,
                    altText,
                });
                // Create a paragraph node after for better editing experience
                const paragraphAfter = (0, lexical_1.$createParagraphNode)();
                // Insert nodes
                (0, lexical_1.$insertNodes)([imageNode, paragraphAfter]);
            });
            // Reset state
            setAltText("");
            setSrc("");
            setIsOpen(false);
        }
    }, [editor, imageFile, src, altText]);
    return ((0, jsx_runtime_1.jsxs)(dialog_1.Dialog, { open: isOpen, onOpenChange: setIsOpen, children: [(0, jsx_runtime_1.jsx)(dialog_1.DialogTrigger, { asChild: true, children: (0, jsx_runtime_1.jsx)(button_1.Button, { size: "icon", variant: "ghost", children: (0, jsx_runtime_1.jsx)(lucide_react_1.ImageIcon, {}) }) }), (0, jsx_runtime_1.jsxs)(dialog_1.DialogContent, { children: [(0, jsx_runtime_1.jsxs)(dialog_1.DialogHeader, { children: [(0, jsx_runtime_1.jsx)(dialog_1.DialogTitle, { children: "Insert Image" }), (0, jsx_runtime_1.jsx)(dialog_1.DialogDescription, { children: "Upload an image or provide a URL" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "grid gap-4 py-4", children: [(0, jsx_runtime_1.jsxs)("div", { className: "grid gap-2", children: [(0, jsx_runtime_1.jsx)(label_1.Label, { htmlFor: "url", children: "Or Image URL" }), (0, jsx_runtime_1.jsx)(input_1.Input, { id: "url", value: src, onChange: (e) => setSrc(e.target.value), placeholder: "https://example.com/image.jpg" })] }), (0, jsx_runtime_1.jsxs)("div", { className: "grid gap-2", children: [(0, jsx_runtime_1.jsx)(label_1.Label, { htmlFor: "alt", children: "Alt Text" }), (0, jsx_runtime_1.jsx)(input_1.Input, { id: "alt", value: altText, onChange: (e) => setAltText(e.target.value), placeholder: "Description of the image" })] })] }), (0, jsx_runtime_1.jsx)(button_1.Button, { variant: "default", onClick: handleInsertImage, disabled: !imageFile && !src, children: "Insert Image" })] })] }));
}
//# sourceMappingURL=MarkdownImagePlugin.js.map