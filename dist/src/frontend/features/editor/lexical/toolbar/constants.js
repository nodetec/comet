"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEADINGS = exports.LOW_PRIORIRTY = exports.RichTextAction = void 0;
var RichTextAction;
(function (RichTextAction) {
    RichTextAction["Bold"] = "bold";
    RichTextAction["Italics"] = "italics";
    RichTextAction["Strikethrough"] = "strikethrough";
    RichTextAction["Code"] = "code";
    RichTextAction["Divider"] = "divider";
    RichTextAction["Undo"] = "undo";
    RichTextAction["Redo"] = "redo";
})(RichTextAction || (exports.RichTextAction = RichTextAction = {}));
exports.LOW_PRIORIRTY = 1;
exports.HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
//# sourceMappingURL=constants.js.map