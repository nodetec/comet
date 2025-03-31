"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownImageNode = void 0;
exports.$createMarkdownImageNode = $createMarkdownImageNode;
exports.$isMarkdownImageNode = $isMarkdownImageNode;
const jsx_runtime_1 = require("react/jsx-runtime");
const lexical_1 = require("lexical");
const MarkdownImageComponent_1 = require("../components/MarkdownImageComponent");
function $convertImageElement(domNode) {
    const img = domNode;
    if (img.src.startsWith("file:///")) {
        return null;
    }
    const { alt: altText, src, width, height } = img;
    const node = $createMarkdownImageNode({ altText, height, src, width });
    return { node };
}
class MarkdownImageNode extends lexical_1.DecoratorNode {
    static getType() {
        return "image";
    }
    static clone(node) {
        return new MarkdownImageNode(node.__src, node.__altText, node.__maxWidth, node.__width, node.__height, node.__key);
    }
    static importJSON(serializedNode) {
        const { altText, height, width, maxWidth, src } = serializedNode;
        return $createMarkdownImageNode({
            altText,
            height,
            maxWidth,
            src,
            width,
        }).updateFromJSON(serializedNode);
    }
    updateFromJSON(serializedNode) {
        const node = super.updateFromJSON(serializedNode);
        return node;
    }
    exportDOM() {
        const element = document.createElement("img");
        element.setAttribute("src", this.__src);
        element.setAttribute("alt", this.__altText);
        element.setAttribute("width", this.__width.toString());
        element.setAttribute("height", this.__height.toString());
        return { element };
    }
    static importDOM() {
        return {
            img: () => ({
                conversion: $convertImageElement,
                priority: 0,
            }),
        };
    }
    constructor(src, altText, maxWidth, width, height, key) {
        super(key);
        this.__src = src;
        this.__altText = altText;
        this.__maxWidth = maxWidth;
        this.__width = width !== null && width !== void 0 ? width : "inherit";
        this.__height = height !== null && height !== void 0 ? height : "inherit";
    }
    exportJSON() {
        return Object.assign(Object.assign({}, super.exportJSON()), { altText: this.getAltText(), height: this.__height === "inherit" ? 0 : this.__height, maxWidth: this.__maxWidth, src: this.getSrc(), width: this.__width === "inherit" ? 0 : this.__width });
    }
    setWidthAndHeight(width, height) {
        const writable = this.getWritable();
        writable.__width = width;
        writable.__height = height;
    }
    createDOM(config) {
        const span = document.createElement("span");
        const theme = config.theme;
        const className = theme.image;
        if (className !== undefined) {
            span.className = className;
        }
        return span;
    }
    updateDOM() {
        return false;
    }
    getSrc() {
        return this.__src;
    }
    getAltText() {
        return this.__altText;
    }
    decorate() {
        return ((0, jsx_runtime_1.jsx)(MarkdownImageComponent_1.MarkdownImageComponent, { src: this.__src, altText: this.__altText, width: this.__width, height: this.__height, maxWidth: this.__maxWidth, nodeKey: this.getKey() }));
    }
}
exports.MarkdownImageNode = MarkdownImageNode;
function $createMarkdownImageNode({ altText, height, 
// TODO: decide if we want to use maxWidth at all
maxWidth = 500, src, width, key, }) {
    return (0, lexical_1.$applyNodeReplacement)(new MarkdownImageNode(src, altText, maxWidth, width, height, key));
}
function $isMarkdownImageNode(node) {
    return node instanceof MarkdownImageNode;
}
//# sourceMappingURL=MarkdownImageNode.js.map