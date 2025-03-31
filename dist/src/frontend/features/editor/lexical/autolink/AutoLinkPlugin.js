"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LexicalAutoLinkPlugin;
const jsx_runtime_1 = require("react/jsx-runtime");
const LexicalAutoLinkPlugin_1 = require("@lexical/react/LexicalAutoLinkPlugin");
const URL_REGEX = /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)(?<![-.+():%])/;
const EMAIL_REGEX = /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;
const MATCHERS = [
    (0, LexicalAutoLinkPlugin_1.createLinkMatcherWithRegExp)(URL_REGEX, (text) => {
        return text.startsWith("http") ? text : `https://${text}`;
    }),
    (0, LexicalAutoLinkPlugin_1.createLinkMatcherWithRegExp)(EMAIL_REGEX, (text) => {
        return `mailto:${text}`;
    }),
];
function LexicalAutoLinkPlugin() {
    return (0, jsx_runtime_1.jsx)(LexicalAutoLinkPlugin_1.AutoLinkPlugin, { matchers: MATCHERS });
}
//# sourceMappingURL=AutoLinkPlugin.js.map