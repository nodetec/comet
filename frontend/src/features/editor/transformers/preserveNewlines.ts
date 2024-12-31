import { type ElementTransformer } from "@lexical/markdown";
import { $createTextNode, $isParagraphNode, ParagraphNode } from "lexical";

export const PRESERVE_NEWLINES: ElementTransformer = {
  type: "element",
  dependencies: [ParagraphNode],
  export: (node) => {
    // console.log("node", node);
    // if ($isParagraphNode(node)) {
    //   const content = node.getTextContent();
    //   if (!content.trim()) {
    //     return "\n \n";
    //   }
    // }
    return null;
  },
  regExp: /^a$/, // a line with only a space
  replace: (textNode, nodes, _, isImport) => {
    // if (isImport && nodes.length === 1) {
    //   textNode.append($createTextNode(""));
    // }
  },
};
