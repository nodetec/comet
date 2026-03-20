import type { TextMatchTransformer } from "@lexical/markdown";
import { $createTextNode } from "lexical";
import {
  $createLinkNode,
  $isAutoLinkNode,
  $isLinkNode,
  LinkNode,
} from "@lexical/link";

const MARKDOWN_LINK_IMPORT_RE =
  /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"((?:[^"\\]|\\.)*)")?\)/;
const MARKDOWN_LINK_END_RE =
  /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"((?:[^"\\]|\\.)*)")?\)$/;

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

function isPlainWebsiteAutolink(
  displayText: string,
  url: string,
  title: string | null,
) {
  return (
    title == null &&
    displayText.length > 0 &&
    (url.startsWith("http://") || url.startsWith("https://")) &&
    displayText === url
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
    if (
      ($isAutoLinkNode(node) && title == null && displayText.length > 0) ||
      isPlainEmailAutolink(displayText, url, title) ||
      isPlainWebsiteAutolink(displayText, url, title)
    ) {
      return displayText;
    }
    const titlePart = title ? ` "${title}"` : "";
    return `[${displayText || url}](${url}${titlePart})`;
  },
  // Match [text](url) format, but NOT ![text](url) which is an image
  importRegExp: MARKDOWN_LINK_IMPORT_RE,
  regExp: MARKDOWN_LINK_END_RE,
  trigger: ")",
  replace: (textNode, match) => {
    const [, displayText, url, rawTitle] = match;
    const parent = textNode.getParent();
    if (parent && $isLinkNode(parent)) {
      return;
    }
    const normalizedUrl = url.trim();
    if (normalizedUrl.length === 0) {
      return;
    }
    const title = rawTitle?.replace(/\\"/g, '"');
    const attributes = {
      ...(getLinkAttributes(normalizedUrl) ?? {}),
      ...(title ? { title } : {}),
    };
    const linkNode = $createLinkNode(
      normalizedUrl,
      Object.keys(attributes).length > 0 ? attributes : undefined,
    );
    linkNode.append($createTextNode(displayText));
    textNode.replace(linkNode);
  },
  type: "text-match",
};
