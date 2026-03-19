import {
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  ORDERED_LIST,
  TEXT_FORMAT_TRANSFORMERS,
  UNORDERED_LIST,
  type ElementTransformer,
} from "@lexical/markdown";
import { $isHorizontalRuleNode, HorizontalRuleNode } from "@lexical/extension";
import { $isQuoteNode, QuoteNode } from "@lexical/rich-text";
import { $isElementNode } from "lexical";

import { LINK } from "./link-transformer";
import { CODE_BLOCK } from "./code-transformer";
import { IMAGE } from "./image-transformer";
import {
  CHECK_LIST as CUSTOM_CHECK_LIST,
  ORDERED_LIST as CUSTOM_ORDERED_LIST,
  UNORDERED_LIST as CUSTOM_UNORDERED_LIST,
} from "./list-transformer";
import { YOUTUBE } from "./youtube-transformer";
import { TABLE, setTableTransformers } from "./table-transformer";

const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => {
    return $isHorizontalRuleNode(node) ? "---" : null;
  },
  regExp: /^---\s*$/,
  replace: () => {},
  type: "element",
};

/**
 * Custom QUOTE export that preserves paragraph breaks inside blockquotes.
 * Lexical's built-in QUOTE export flattens all children into a single line.
 * We export each block child separated by `>\n>` to maintain paragraphs.
 */
const QUOTE: ElementTransformer = {
  dependencies: [QuoteNode],
  export: (node, traverseChildren) => {
    if (!$isQuoteNode(node)) {
      return null;
    }
    // Export each child block separately, joined by blank quote line
    const children = node.getChildren();
    const parts: string[] = [];
    for (const child of children) {
      if ($isElementNode(child)) {
        const childMd = traverseChildren(child);
        parts.push(childMd);
      } else {
        parts.push(child.getTextContent());
      }
    }
    // Join paragraphs with blank line, then prefix every line with >
    const joined = parts.join("\n\n");
    return joined
      .split("\n")
      .map((line) => (line === "" ? ">" : `> ${line}`))
      .join("\n");
  },
  regExp: /^>\s/,
  replace: () => {},
  type: "element",
};

// Filter out Lexical's built-in QUOTE from ELEMENT_TRANSFORMERS since we
// override it with our own.
const BASE_ELEMENT_TRANSFORMERS = ELEMENT_TRANSFORMERS.filter(
  (t) =>
    !t.dependencies.includes(QuoteNode) &&
    t !== UNORDERED_LIST &&
    t !== CHECK_LIST &&
    t !== ORDERED_LIST,
);

/**
 * Shared transformer array for the Comet editor.
 *
 * Ordering: custom transformers first, then standard element transformers
 * (with QUOTE replaced by our custom version), then CODE_BLOCK, then
 * text format transformers. We deliberately exclude TEXT_MATCH_TRANSFORMERS
 * because it contains the default link transformer that conflicts with
 * our custom LINK.
 */
export const TRANSFORMERS = [
  TABLE,
  YOUTUBE,
  IMAGE,
  LINK,
  HORIZONTAL_RULE,
  QUOTE,
  CUSTOM_UNORDERED_LIST,
  CUSTOM_CHECK_LIST,
  CUSTOM_ORDERED_LIST,
  ...BASE_ELEMENT_TRANSFORMERS,
  CODE_BLOCK,
  ...TEXT_FORMAT_TRANSFORMERS,
];

// Set transformers for table cell content parsing
setTableTransformers(TRANSFORMERS as ElementTransformer[]);
