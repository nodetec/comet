import type { TextMatchTransformer } from "@lexical/markdown";
import { $createImageNode, $isImageNode, ImageNode } from "../nodes/image-node";
import { resolveImageSrc, unresolveImageSrc } from "@/shared/lib/attachments";

export const IMAGE: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) {
      return null;
    }
    const src = unresolveImageSrc(node.getSrc());
    const title = node.getTitle();
    const escapedTitle = title.split('"').join(String.raw`\"`);
    const titlePart = title ? ` "${escapedTitle}"` : "";
    return `![${node.getAltText()}](${src}${titlePart})`;
  },
  importRegExp: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"((?:[^"\\]|\\.)*)")?\)/,
  regExp: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"((?:[^"\\]|\\.)*)")?\)$/,
  trigger: ")",
  replace: (textNode, match) => {
    const [, altText, src, rawTitle] = match;
    const resolvedSrc = resolveImageSrc(src);
    const title = rawTitle?.replace(/\\"/g, '"') ?? "";
    const imageNode = $createImageNode({ src: resolvedSrc, altText, title });
    textNode.replace(imageNode);
  },
  type: "text-match",
};
