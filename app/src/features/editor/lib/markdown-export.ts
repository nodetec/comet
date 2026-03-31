import type {
  ElementTransformer,
  MultilineElementTransformer,
  TextFormatTransformer,
  TextMatchTransformer,
  Transformer,
} from "@lexical/markdown";
import {
  $getRoot,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
  type TextFormatType,
  type TextNode,
} from "lexical";

type UnclosedTag = { format: TextFormatType; tag: string };

const MARKDOWN_EMPTY_LINE_REG_EXP = /^\s{0,3}$/;

function transformersByType(transformers: Array<Transformer>): {
  element: Array<ElementTransformer>;
  multilineElement: Array<MultilineElementTransformer>;
  textFormat: Array<TextFormatTransformer>;
  textMatch: Array<TextMatchTransformer>;
} {
  const byType = {
    element: [] as Array<ElementTransformer>,
    multilineElement: [] as Array<MultilineElementTransformer>,
    textFormat: [] as Array<TextFormatTransformer>,
    textMatch: [] as Array<TextMatchTransformer>,
  };

  for (const transformer of transformers) {
    switch (transformer.type) {
      case "element": {
        byType.element.push(transformer);
        break;
      }
      case "multiline-element": {
        byType.multilineElement.push(transformer);
        break;
      }
      case "text-format": {
        byType.textFormat.push(transformer);
        break;
      }
      case "text-match": {
        byType.textMatch.push(transformer);
        break;
      }
    }
  }

  return byType;
}

function isEmptyParagraph(node: LexicalNode): boolean {
  if (!$isParagraphNode(node)) {
    return false;
  }

  const firstChild = node.getFirstChild();
  return (
    firstChild == null ||
    (node.getChildrenSize() === 1 &&
      $isTextNode(firstChild) &&
      MARKDOWN_EMPTY_LINE_REG_EXP.test(firstChild.getTextContent()))
  );
}

function exportTopLevelElements(
  node: LexicalNode,
  elementTransformers: Array<ElementTransformer | MultilineElementTransformer>,
  textTransformers: Array<TextFormatTransformer>,
  textMatchTransformers: Array<TextMatchTransformer>,
): string | null {
  for (const transformer of elementTransformers) {
    if (!transformer.export) {
      continue;
    }

    const result = transformer.export(node, (childNode) =>
      exportChildren(childNode, textTransformers, textMatchTransformers),
    );

    if (result != null) {
      return result;
    }
  }

  if ($isElementNode(node)) {
    return exportChildren(node, textTransformers, textMatchTransformers);
  }

  if ($isDecoratorNode(node)) {
    return node.getTextContent();
  }

  return null;
}

export function $convertTopLevelElementToMarkdown(
  node: LexicalNode,
  transformers: Array<Transformer>,
): string | null {
  const byType = transformersByType(transformers);
  const elementTransformers = [...byType.multilineElement, ...byType.element];
  const textTransformers = byType.textFormat
    .filter((transformer) => transformer.format.length === 1)
    // eslint-disable-next-line unicorn/no-array-sort -- app tsconfig targets ES2020, so toSorted() is unavailable here
    .sort(
      (a, b) =>
        Number(a.format.includes("code")) - Number(b.format.includes("code")),
    );

  return exportTopLevelElements(
    node,
    elementTransformers,
    textTransformers,
    byType.textMatch,
  );
}

function exportChildren(
  node: ElementNode,
  textTransformers: Array<TextFormatTransformer>,
  textMatchTransformers: Array<TextMatchTransformer>,
  unclosedTags: Array<UnclosedTag> = [],
  unclosableTags: Array<UnclosedTag> = [],
): string {
  const output: string[] = [];
  const children = node.getChildren();

  mainLoop: for (const child of children) {
    for (const transformer of textMatchTransformers) {
      if (!transformer.export) {
        continue;
      }

      const result = transformer.export(
        child,
        (parentNode) =>
          exportChildren(
            parentNode,
            textTransformers,
            textMatchTransformers,
            unclosedTags,
            [...unclosableTags, ...unclosedTags],
          ),
        (textNode, textContent) =>
          exportTextFormat(
            textNode,
            textContent,
            textTransformers,
            unclosedTags,
            unclosableTags,
          ),
      );

      if (result != null) {
        output.push(result);
        continue mainLoop;
      }
    }

    if ($isLineBreakNode(child)) {
      output.push("\n");
    } else if ($isTextNode(child)) {
      output.push(
        exportTextFormat(
          child,
          child.getTextContent(),
          textTransformers,
          unclosedTags,
          unclosableTags,
        ),
      );
    } else if ($isElementNode(child)) {
      output.push(
        exportChildren(
          child,
          textTransformers,
          textMatchTransformers,
          unclosedTags,
          unclosableTags,
        ),
      );
    } else if ($isDecoratorNode(child)) {
      output.push(child.getTextContent());
    }
  }

  return output.join("");
}

function computeOpeningTags(
  node: TextNode,
  prevNode: TextNode | null,
  textTransformers: Array<TextFormatTransformer>,
  unclosedTags: Array<UnclosedTag>,
): string {
  let openingTags = "";
  const applied = new Set<TextFormatType>();

  for (const transformer of textTransformers) {
    const format = transformer.format[0];
    const tag = transformer.tag;

    if (checkHasFormat(node, format) && !applied.has(format)) {
      applied.add(format);

      if (
        !checkHasFormat(prevNode, format) ||
        !unclosedTags.some((element) => element.tag === tag)
      ) {
        unclosedTags.push({ format, tag });
        openingTags += tag;
      }
    }
  }

  return openingTags;
}

function popClosingTags(
  unclosedTags: Array<UnclosedTag>,
  unclosableTags: Array<UnclosedTag> | undefined,
  startIndex: number,
  nodeHasFormat: boolean,
  nextNodeHasFormat: boolean,
): { closingTagsBefore: string; closingTagsAfter: string } {
  let closingTagsBefore = "";
  let closingTagsAfter = "";
  const unhandledUnclosedTags = [...unclosedTags];

  while (unhandledUnclosedTags.length > startIndex) {
    const unclosedTag = unhandledUnclosedTags.pop();

    if (
      unclosableTags &&
      unclosedTag &&
      unclosableTags.some((element) => element.tag === unclosedTag.tag)
    ) {
      continue;
    }

    if (unclosedTag) {
      if (!nodeHasFormat) {
        closingTagsBefore += unclosedTag.tag;
      } else if (!nextNodeHasFormat) {
        closingTagsAfter += unclosedTag.tag;
      }
    }

    unclosedTags.pop();
  }

  return { closingTagsBefore, closingTagsAfter };
}

function computeClosingTags(
  node: TextNode,
  nextNode: TextNode | null,
  unclosedTags: Array<UnclosedTag>,
  unclosableTags: Array<UnclosedTag> | undefined,
): { closingTagsBefore: string; closingTagsAfter: string } {
  for (let i = 0; i < unclosedTags.length; i++) {
    const nodeHasFormat = hasFormat(node, unclosedTags[i].format);
    const nextNodeHasFormat = hasFormat(nextNode, unclosedTags[i].format);

    if (nodeHasFormat && nextNodeHasFormat) {
      continue;
    }

    return popClosingTags(
      unclosedTags,
      unclosableTags,
      i,
      nodeHasFormat,
      nextNodeHasFormat,
    );
  }

  return { closingTagsBefore: "", closingTagsAfter: "" };
}

function exportTextFormat(
  node: TextNode,
  textContent: string,
  textTransformers: Array<TextFormatTransformer>,
  unclosedTags: Array<UnclosedTag>,
  unclosableTags?: Array<UnclosedTag>,
): string {
  // Strip inline-decorator ZWSP cursor anchors. These are inserted beside
  // HR/image/YouTube nodes for caret placement and must not leak into stored
  // markdown. Checklist markers use a separate model and are handled elsewhere.
  let output = textContent.replace(/\u200B/g, "");
  if (!node.hasFormat("code")) {
    output = output.replace(/([*_`~\\])/g, String.raw`\$1`);
  }

  // Extract leading/trailing whitespace without regex (avoids slow-regex lint)
  let leadStart = 0;
  while (leadStart < output.length && /\s/.test(output[leadStart])) leadStart++;
  let trailEnd = output.length;
  while (trailEnd > leadStart && /\s/.test(output[trailEnd - 1])) trailEnd--;
  const leadingSpace = output.slice(0, leadStart);
  const trimmedOutput = output.slice(leadStart, trailEnd);
  const trailingSpace = output.slice(trailEnd);
  const isWhitespaceOnly = trimmedOutput === "";

  const prevNode = getTextSibling(node, true);
  const nextNode = getTextSibling(node, false);

  const openingTags = computeOpeningTags(
    node,
    prevNode,
    textTransformers,
    unclosedTags,
  );
  const { closingTagsBefore, closingTagsAfter } = computeClosingTags(
    node,
    nextNode,
    unclosedTags,
    unclosableTags,
  );

  if (isWhitespaceOnly && !node.hasFormat("code")) {
    return closingTagsBefore + output;
  }

  // Keep boundary whitespace outside formatting tags so nested emphasis
  // exports as plain markdown instead of HTML space entities.
  return (
    closingTagsBefore +
    leadingSpace +
    openingTags +
    trimmedOutput +
    closingTagsAfter +
    trailingSpace
  );
}

function getTextSibling(node: TextNode, backward: boolean): TextNode | null {
  const sibling = backward ? node.getPreviousSibling() : node.getNextSibling();
  return $isTextNode(sibling) ? sibling : null;
}

function hasFormat(
  node: LexicalNode | null | undefined,
  format: TextFormatType,
): boolean {
  return $isTextNode(node) && node.hasFormat(format);
}

function checkHasFormat(
  node: TextNode | null,
  format: TextFormatType,
): boolean {
  if (!node || !hasFormat(node, format)) {
    return false;
  }

  if (format === "code") {
    return true;
  }

  return !/^\s*$/.test(node.getTextContent());
}

export function $convertToMarkdownStringNormalized(
  transformers: Array<Transformer>,
  node?: ElementNode,
  shouldPreserveNewLines = false,
): string {
  const byType = transformersByType(transformers);
  const elementTransformers = [...byType.multilineElement, ...byType.element];
  const textTransformers = byType.textFormat
    .filter((transformer) => transformer.format.length === 1)
    // eslint-disable-next-line unicorn/no-array-sort -- app tsconfig targets ES2020, so toSorted() is unavailable here
    .sort(
      (a, b) =>
        Number(a.format.includes("code")) - Number(b.format.includes("code")),
    );
  const isNewlineDelimited = !shouldPreserveNewLines;

  const output: string[] = [];
  const children = (node ?? $getRoot()).getChildren();

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const result = exportTopLevelElements(
      child,
      elementTransformers,
      textTransformers,
      byType.textMatch,
    );

    if (result == null) {
      continue;
    }

    output.push(
      isNewlineDelimited &&
        i > 0 &&
        !isEmptyParagraph(child) &&
        !isEmptyParagraph(children[i - 1])
        ? `\n${result}`
        : result,
    );
  }

  return output.join("\n");
}
