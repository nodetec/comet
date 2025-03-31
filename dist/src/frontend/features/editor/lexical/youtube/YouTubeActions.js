"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INSERT_YOUTUBE_COMMAND = void 0;
exports.default = YoutubeAction;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const utils_1 = require("@lexical/utils");
const button_1 = require("~/components/ui/button");
const dialog_1 = require("~/components/ui/dialog");
const input_1 = require("~/components/ui/input");
const store_1 = require("~/store");
const lexical_1 = require("lexical");
const lucide_react_1 = require("lucide-react");
const YouTubeNode_1 = require("./YouTubeNode");
exports.INSERT_YOUTUBE_COMMAND = (0, lexical_1.createCommand)("INSERT_YOUTUBE_COMMAND");
function YoutubeAction() {
    const [url, setURL] = (0, react_1.useState)("");
    const [isOpen, setIsOpen] = (0, react_1.useState)(false); // Add state to control dialog open state
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    (0, react_1.useEffect)(() => {
        if (!editor.hasNodes([YouTubeNode_1.YouTubeNode])) {
            throw new Error("YouTubePlugin: YouTubeNode not registered on editor");
        }
        return editor.registerCommand(exports.INSERT_YOUTUBE_COMMAND, (payload) => {
            const youTubeNode = (0, YouTubeNode_1.$createYouTubeNode)(payload);
            // Create paragraph nodes before and after
            const paragraphBefore = (0, lexical_1.$createParagraphNode)();
            const paragraphAfter = (0, lexical_1.$createParagraphNode)();
            // Insert all three nodes
            (0, utils_1.$insertNodeToNearestRoot)(paragraphBefore);
            paragraphBefore.insertAfter(youTubeNode);
            youTubeNode.insertAfter(paragraphAfter);
            return true;
        }, lexical_1.COMMAND_PRIORITY_EDITOR);
    }, [editor]);
    const onEmbed = () => {
        var _a;
        if (!url)
            return;
        const match = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/.exec(url);
        const id = match && ((_a = match === null || match === void 0 ? void 0 : match[2]) === null || _a === void 0 ? void 0 : _a.length) === 11 ? match === null || match === void 0 ? void 0 : match[2] : null;
        if (!id)
            return;
        editor.update(() => {
            const youTubeNode = (0, YouTubeNode_1.$createYouTubeNode)(id);
            // Create paragraph nodes before and after
            const paragraphBefore = (0, lexical_1.$createParagraphNode)();
            const paragraphAfter = (0, lexical_1.$createParagraphNode)();
            // Insert all three nodes as a group
            (0, lexical_1.$insertNodes)([paragraphBefore, youTubeNode, paragraphAfter]);
        });
        setURL("");
        setIsOpen(false); // Close the dialog
    };
    return ((0, jsx_runtime_1.jsxs)(dialog_1.Dialog, { open: isOpen, onOpenChange: setIsOpen, children: [(0, jsx_runtime_1.jsx)(button_1.Button, { onClick: () => setIsOpen(true), onDoubleClick: (e) => e.stopPropagation(), className: "hidden lg:flex", size: "icon", variant: "ghost", disabled: feedType === "trash", children: (0, jsx_runtime_1.jsx)(lucide_react_1.YoutubeIcon, {}) }), (0, jsx_runtime_1.jsxs)(dialog_1.DialogContent, { children: [(0, jsx_runtime_1.jsxs)(dialog_1.DialogHeader, { children: [(0, jsx_runtime_1.jsx)(dialog_1.DialogTitle, { children: "Embed YouTube Video" }), (0, jsx_runtime_1.jsx)(dialog_1.DialogDescription, { children: "Paste a YouTube URL to embed it in your document." })] }), (0, jsx_runtime_1.jsx)(input_1.Input, { value: url, onChange: (e) => setURL(e.target.value), placeholder: "Add Youtube URL" }), (0, jsx_runtime_1.jsx)(button_1.Button, { type: "submit", variant: "default", disabled: !url, onClick: onEmbed, children: "Embed" })] })] }));
}
//# sourceMappingURL=YouTubeActions.js.map