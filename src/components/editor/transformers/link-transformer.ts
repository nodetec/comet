import type { TextMatchTransformer } from "@lexical/markdown";
import { $createTextNode } from "lexical";
import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link";

function getLinkAttributes(url: string) {
  if (url.startsWith("#")) {
    return undefined;
  }
  return { target: "_blank", rel: "noopener noreferrer" };
}

export const LINK: TextMatchTransformer = {
  dependencies: [LinkNode],
  export: (node) => {
    if (!$isLinkNode(node)) {
      return null;
    }
    const displayText = node.getTextContent();
    const url = node.getURL();
    const title = node.getTitle();
    const titlePart = title ? ` "${title}"` : "";
    return `[${displayText || url}](${url}${titlePart})`;
  },
  // Match [text](url) format, but NOT ![text](url) which is an image
  importRegExp: /(?<!!)\[([^\]]+)\]\(([^)]+)\)/,
  regExp: /(?<!!)\[([^\]]+)\]\(([^)]+)\)$/,
  trigger: ")",
  replace: (textNode, match) => {
    const [, displayText, url] = match;
    const parent = textNode.getParent();
    if (parent && $isLinkNode(parent)) {
      return;
    }
    const normalizedUrl = url.trim();
    if (normalizedUrl.length === 0) {
      return;
    }
    const linkNode = $createLinkNode(
      normalizedUrl,
      getLinkAttributes(normalizedUrl),
    );
    linkNode.append($createTextNode(displayText));
    textNode.replace(linkNode);
  },
  type: "text-match",
};
