"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomHashtagPlugin = CustomHashtagPlugin;
const react_1 = require("react");
const hashtag_1 = require("@lexical/hashtag");
const LexicalComposerContext_1 = require("@lexical/react/LexicalComposerContext");
const useLexicalTextEntity_1 = require("@lexical/react/useLexicalTextEntity");
const getHashtagRegexString_1 = require("~/lib/markdown/getHashtagRegexString");
const REGEX = new RegExp((0, getHashtagRegexString_1.getHashtagRegexString)(), "i");
function CustomHashtagPlugin() {
    const [editor] = (0, LexicalComposerContext_1.useLexicalComposerContext)();
    (0, react_1.useEffect)(() => {
        if (!editor.hasNodes([hashtag_1.HashtagNode])) {
            throw new Error("HashtagPlugin: HashtagNode not registered on editor");
        }
    }, [editor]);
    const $createHashtagNode_ = (0, react_1.useCallback)((textNode) => {
        return (0, hashtag_1.$createHashtagNode)(textNode.getTextContent());
    }, []);
    const getHashtagMatch = (0, react_1.useCallback)((text) => {
        const matchArr = REGEX.exec(text);
        if (matchArr === null) {
            return null;
        }
        const hashtagLength = matchArr[3].length + 1;
        const startOffset = matchArr.index + matchArr[1].length;
        const endOffset = startOffset + hashtagLength;
        return {
            end: endOffset,
            start: startOffset,
        };
    }, []);
    (0, useLexicalTextEntity_1.useLexicalTextEntity)(getHashtagMatch, hashtag_1.HashtagNode, $createHashtagNode_);
    return null;
}
//# sourceMappingURL=CustomHashtagPlugin.js.map