"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = CodeBlockPlugin;
const jsx_runtime_1 = require("react/jsx-runtime");
const code_1 = require("@lexical/code");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const selection_1 = require("@lexical/selection");
const button_1 = require("~/components/ui/button");
const utils_1 = require("~/lib/utils");
const store_1 = require("~/store");
const lexical_1 = require("lexical");
const lucide_react_1 = require("lucide-react");
function CodeBlockPlugin({ blockType }) {
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    const feedType = (0, store_1.useAppState)((state) => state.feedType);
    //   useEffect(() => {
    //     registerCodeHighlighting(editor);
    //   }, [editor]);
    const onAddCodeBlock = () => {
        editor.update(() => {
            const selection = (0, lexical_1.$getSelection)();
            if ((0, lexical_1.$isRangeSelection)(selection)) {
                // Create the code block
                const codeNode = (0, code_1.$createCodeNode)();
                // First transform selection to codeblock
                (0, selection_1.$setBlocksType)(selection, () => codeNode);
            }
        });
    };
    return ((0, jsx_runtime_1.jsx)(button_1.Button, { size: "icon", variant: "ghost", className: (0, utils_1.cn)("hidden lg:flex", blockType === "code" ? "bg-accent/50" : ""), onClick: onAddCodeBlock, onDoubleClick: (e) => e.stopPropagation(), disabled: feedType === "trash", children: (0, jsx_runtime_1.jsx)(lucide_react_1.SquareCodeIcon, {}) }));
}
//# sourceMappingURL=CodeBlockPlugin.js.map