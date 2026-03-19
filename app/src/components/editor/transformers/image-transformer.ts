import type { TextMatchTransformer } from "@lexical/markdown";
import { $createImageNode, $isImageNode, ImageNode } from "../nodes/image-node";
import { resolveImageSrc, unresolveImageSrc } from "@/lib/attachments";

export const IMAGE: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) {
      return null;
    }
    const src = unresolveImageSrc(node.getSrc());
    return `![${node.getAltText()}](${src})`;
  },
  importRegExp: /!(?:\[([^[]*)\])(?:\(([^(]+)\))/,
  regExp: /!\[([^\]]*)\]\(([^)]+)\)$/,
  trigger: ")",
  replace: (textNode, match) => {
    const [, altText, src] = match;
    const resolvedSrc = resolveImageSrc(src);
    const imageNode = $createImageNode({ src: resolvedSrc, altText });
    textNode.replace(imageNode);
  },
  type: "text-match",
};
