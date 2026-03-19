import type { TextMatchTransformer } from "@lexical/markdown";
import { $createTextNode } from "lexical";
import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link";

function getLinkAttributes(url: string) {
  if (url.startsWith("#")) {
    return undefined;
  }
  return { target: "_blank", rel: "noopener noreferrer" };
}

function isPlainEmailAutolink(
  displayText: string,
  url: string,
  title: string | null,
) {
  return (
    title == null &&
    displayText.length > 0 &&
    url.startsWith("mailto:") &&
    url.slice("mailto:".length) === displayText
  );
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
    if (isPlainEmailAutolink(displayText, url, title)) {
      return displayText;
    }
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
