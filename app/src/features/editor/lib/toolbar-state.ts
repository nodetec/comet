import { Text } from "@codemirror/state";

export type BlockType = "paragraph" | "h1" | "h2" | "h3" | "code";
export type InlineFormat = "bold" | "italic" | "strikethrough" | "code";
export type SelectionSnapshot = {
  anchor: number;
  head: number;
};
export type ToolbarMutation = {
  markdown: string;
  selection: SelectionSnapshot;
};
export type ToolbarState = {
  blockType: BlockType;
  isBold: boolean;
  isCode: boolean;
  isItalic: boolean;
  isStrikethrough: boolean;
};

type NormalizedSelection = SelectionSnapshot & {
  empty: boolean;
  from: number;
  to: number;
};

type InlineMarkerBounds = {
  from: number;
  innerFrom: number;
  innerTo: number;
  to: number;
};

const INLINE_MARKERS: Record<InlineFormat, string> = {
  bold: "**",
  italic: "*",
  strikethrough: "~~",
  code: "`",
};

const BLOCK_CYCLE: readonly BlockType[] = ["paragraph", "h1", "h2", "h3"];
const HEADING_PREFIX_BY_TYPE: Record<Exclude<BlockType, "code">, string> = {
  paragraph: "",
  h1: "# ",
  h2: "## ",
  h3: "### ",
};

const HEADING_PREFIX_RE = /^(#{1,3})\s+/;
const CODE_FENCE_RE = /^\s*(```|~~~)/;

export const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  blockType: "paragraph",
  isBold: false,
  isCode: false,
  isItalic: false,
  isStrikethrough: false,
};

function createText(markdown: string) {
  return Text.of(markdown.split("\n"));
}

function normalizeSelection(
  markdown: string,
  selection: SelectionSnapshot,
): NormalizedSelection {
  const clampedAnchor = clamp(selection.anchor, 0, markdown.length);
  const clampedHead = clamp(selection.head, 0, markdown.length);

  return {
    anchor: clampedAnchor,
    head: clampedHead,
    from: Math.min(clampedAnchor, clampedHead),
    to: Math.max(clampedAnchor, clampedHead),
    empty: clampedAnchor === clampedHead,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isForwardSelection(selection: SelectionSnapshot) {
  return selection.anchor <= selection.head;
}

function preserveDirection(
  selection: SelectionSnapshot,
  from: number,
  to = from,
): SelectionSnapshot {
  return isForwardSelection(selection)
    ? { anchor: from, head: to }
    : { anchor: to, head: from };
}

function replaceRange(
  markdown: string,
  from: number,
  to: number,
  insert: string,
) {
  return `${markdown.slice(0, from)}${insert}${markdown.slice(to)}`;
}

function findSurroundingInlineMarker(
  markdown: string,
  position: number,
  marker: string,
): InlineMarkerBounds | null {
  const text = createText(markdown);
  const line = text.lineAt(clamp(position, 0, markdown.length));
  const offset = clamp(position - line.from, 0, line.length);

  let openIndex = findPreviousMarker(
    line.text,
    Math.max(offset - 1, 0),
    marker,
  );
  while (openIndex !== -1) {
    const closeIndex = findNextMarker(
      line.text,
      openIndex + marker.length,
      marker,
    );
    if (closeIndex !== -1) {
      const innerFrom = line.from + openIndex + marker.length;
      const innerTo = line.from + closeIndex;
      if (position >= innerFrom && position <= innerTo) {
        return {
          from: line.from + openIndex,
          innerFrom,
          innerTo,
          to: line.from + closeIndex + marker.length,
        };
      }
    }

    openIndex =
      openIndex > 0 ? findPreviousMarker(line.text, openIndex - 1, marker) : -1;
  }

  return null;
}

function markerRepeatsSameCharacter(marker: string) {
  return [...marker].every((character) => character === marker[0]);
}

function isMarkerToken(text: string, index: number, marker: string) {
  if (text.slice(index, index + marker.length) !== marker) {
    return false;
  }

  if (!markerRepeatsSameCharacter(marker)) {
    return true;
  }

  const repeatedCharacter = marker[0] ?? "";
  return (
    text[index - 1] !== repeatedCharacter &&
    text[index + marker.length] !== repeatedCharacter
  );
}

function findPreviousMarker(text: string, from: number, marker: string) {
  let index = text.lastIndexOf(marker, from);
  while (index !== -1 && !isMarkerToken(text, index, marker)) {
    index = index > 0 ? text.lastIndexOf(marker, index - 1) : -1;
  }
  return index;
}

function findNextMarker(text: string, from: number, marker: string) {
  let index = text.indexOf(marker, from);
  while (index !== -1 && !isMarkerToken(text, index, marker)) {
    index = text.indexOf(marker, index + 1);
  }
  return index;
}

function hasAdjacentMarkers(
  markdown: string,
  from: number,
  to: number,
  marker: string,
) {
  if (from < marker.length || to + marker.length > markdown.length) {
    return false;
  }

  return (
    isMarkerToken(markdown, from - marker.length, marker) &&
    isMarkerToken(markdown, to, marker)
  );
}

function selectionHasInlineFormat(
  markdown: string,
  selection: SelectionSnapshot,
  format: InlineFormat,
) {
  const marker = INLINE_MARKERS[format];
  const range = normalizeSelection(markdown, selection);

  if (range.empty) {
    return findSurroundingInlineMarker(markdown, range.head, marker) !== null;
  }

  if (hasAdjacentMarkers(markdown, range.from, range.to, marker)) {
    return true;
  }

  const probe = range.from + Math.floor((range.to - range.from) / 2);
  const surrounding = findSurroundingInlineMarker(markdown, probe, marker);
  return (
    surrounding !== null &&
    range.from >= surrounding.innerFrom &&
    range.to <= surrounding.innerTo
  );
}

type CodeFenceRange = {
  closeLineNumber: number | null;
  openLineNumber: number;
};

function getCodeFenceRangeAt(
  markdown: string,
  position: number,
): CodeFenceRange | null {
  const text = createText(markdown);
  const currentLineNumber = text.lineAt(
    clamp(position, 0, markdown.length),
  ).number;
  let openFence: { fence: string; lineNumber: number } | null = null;

  for (let lineNumber = 1; lineNumber <= text.lines; lineNumber += 1) {
    const line = text.line(lineNumber);
    const match = CODE_FENCE_RE.exec(line.text);
    if (!match) {
      continue;
    }

    const fence = match[1] ?? "";
    if (openFence === null) {
      openFence = { fence, lineNumber };
      continue;
    }

    if (openFence.fence !== fence) {
      continue;
    }

    if (
      currentLineNumber >= openFence.lineNumber &&
      currentLineNumber <= lineNumber
    ) {
      return {
        closeLineNumber: lineNumber,
        openLineNumber: openFence.lineNumber,
      };
    }

    openFence = null;
  }

  if (openFence && currentLineNumber >= openFence.lineNumber) {
    return {
      closeLineNumber: null,
      openLineNumber: openFence.lineNumber,
    };
  }

  return null;
}

function isInsideCodeFence(markdown: string, position: number): boolean {
  const text = createText(markdown);
  const currentLine = text.lineAt(clamp(position, 0, markdown.length));

  // Scan backward from the cursor line to find an unclosed fence.
  // Only need to track the most recent open fence, not all of them.
  let openFence: string | null = null;

  for (let lineNumber = 1; lineNumber <= currentLine.number; lineNumber++) {
    const line = text.line(lineNumber);
    const match = CODE_FENCE_RE.exec(line.text);
    if (!match) continue;

    const fence = match[1] ?? "";
    if (openFence === null) {
      openFence = fence;
    } else if (openFence === fence) {
      openFence = null;
    }
  }

  return openFence !== null;
}

function getBlockType(markdown: string, position: number): BlockType {
  const text = createText(markdown);
  const line = text.lineAt(clamp(position, 0, markdown.length));

  // Quick line-local check for heading — avoids scanning the document
  const headingMatch = HEADING_PREFIX_RE.exec(line.text);
  if (headingMatch) {
    switch (headingMatch[1]?.length) {
      case 1: {
        return "h1";
      }
      case 2: {
        return "h2";
      }
      case 3: {
        return "h3";
      }
    }
  }

  // Only scan for code fences if the line could plausibly be inside one
  // (not a heading, and fences exist somewhere above the cursor).
  if (isInsideCodeFence(markdown, position)) {
    return "code";
  }

  return "paragraph";
}

function unwrapCodeFenceBlock(
  markdown: string,
  selection: SelectionSnapshot,
): ToolbarMutation {
  const range = getCodeFenceRangeAt(markdown, selection.head);
  if (!range) {
    return { markdown, selection };
  }

  const lines = markdown.split("\n");
  const nextLines = lines.filter((_, index) => {
    const lineNumber = index + 1;
    return (
      lineNumber !== range.openLineNumber &&
      lineNumber !== range.closeLineNumber
    );
  });
  const nextMarkdown = nextLines.join("\n");
  const openLine = createText(markdown).line(range.openLineNumber);
  const cursor = clamp(openLine.from, 0, nextMarkdown.length);

  return {
    markdown: nextMarkdown,
    selection: { anchor: cursor, head: cursor },
  };
}

function wrapSelectionWithMarker(
  markdown: string,
  selection: SelectionSnapshot,
  marker: string,
): ToolbarMutation {
  const range = normalizeSelection(markdown, selection);
  const selectedText = markdown.slice(range.from, range.to);
  const wrapped = `${marker}${selectedText}${marker}`;
  const nextMarkdown = replaceRange(markdown, range.from, range.to, wrapped);

  if (range.empty) {
    const cursor = range.from + marker.length;
    return {
      markdown: nextMarkdown,
      selection: { anchor: cursor, head: cursor },
    };
  }

  return {
    markdown: nextMarkdown,
    selection: preserveDirection(
      selection,
      range.from + marker.length,
      range.to + marker.length,
    ),
  };
}

export function getToolbarState(
  markdown: string,
  selection: SelectionSnapshot,
): ToolbarState {
  return {
    blockType: getBlockType(markdown, selection.head),
    isBold: selectionHasInlineFormat(markdown, selection, "bold"),
    isCode: selectionHasInlineFormat(markdown, selection, "code"),
    isItalic: selectionHasInlineFormat(markdown, selection, "italic"),
    isStrikethrough: selectionHasInlineFormat(
      markdown,
      selection,
      "strikethrough",
    ),
  };
}

export function toggleInlineFormat(
  markdown: string,
  selection: SelectionSnapshot,
  format: InlineFormat,
): ToolbarMutation {
  const marker = INLINE_MARKERS[format];
  const range = normalizeSelection(markdown, selection);

  if (
    !range.empty &&
    hasAdjacentMarkers(markdown, range.from, range.to, marker)
  ) {
    const nextMarkdown = replaceRange(
      replaceRange(markdown, range.to, range.to + marker.length, ""),
      range.from - marker.length,
      range.from,
      "",
    );

    return {
      markdown: nextMarkdown,
      selection: preserveDirection(
        selection,
        range.from - marker.length,
        range.to - marker.length,
      ),
    };
  }

  if (range.empty) {
    const surrounding = findSurroundingInlineMarker(
      markdown,
      range.head,
      marker,
    );
    if (surrounding) {
      const nextMarkdown = replaceRange(
        replaceRange(markdown, surrounding.innerTo, surrounding.to, ""),
        surrounding.from,
        surrounding.innerFrom,
        "",
      );
      const cursor = range.head - marker.length;
      return {
        markdown: nextMarkdown,
        selection: { anchor: cursor, head: cursor },
      };
    }
  }

  return wrapSelectionWithMarker(markdown, selection, marker);
}

export function cycleBlockType(
  markdown: string,
  selection: SelectionSnapshot,
): ToolbarMutation {
  const currentType = getBlockType(markdown, selection.head);
  if (currentType === "code") {
    return unwrapCodeFenceBlock(markdown, selection);
  }

  const currentIndex = BLOCK_CYCLE.indexOf(currentType);
  const targetType = BLOCK_CYCLE[
    (currentIndex + 1) % BLOCK_CYCLE.length
  ] as Exclude<BlockType, "code">;
  const text = createText(markdown);
  const range = normalizeSelection(markdown, selection);
  const startLine = text.lineAt(range.from);
  const endLine = text.lineAt(
    clamp(
      range.empty ? range.to : Math.max(range.to - 1, range.from),
      0,
      markdown.length,
    ),
  );
  const selectedBlock = markdown.slice(startLine.from, endLine.to);
  const nextBlock = selectedBlock
    .split("\n")
    .map((line) => {
      const stripped = line.replace(HEADING_PREFIX_RE, "");
      if (targetType === "paragraph" || line.trim().length === 0) {
        return stripped;
      }
      return `${HEADING_PREFIX_BY_TYPE[targetType]}${stripped}`;
    })
    .join("\n");
  const nextMarkdown = replaceRange(
    markdown,
    startLine.from,
    endLine.to,
    nextBlock,
  );

  if (startLine.number !== endLine.number) {
    return {
      markdown: nextMarkdown,
      selection: preserveDirection(
        selection,
        startLine.from,
        startLine.from + nextBlock.length,
      ),
    };
  }

  const currentContent = startLine.text.replace(HEADING_PREFIX_RE, "");
  const currentPrefixLength = startLine.text.length - currentContent.length;
  const nextPrefixLength = HEADING_PREFIX_BY_TYPE[targetType].length;
  const nextAnchor =
    startLine.from +
    nextPrefixLength +
    clamp(
      selection.anchor - startLine.from - currentPrefixLength,
      0,
      currentContent.length,
    );
  const nextHead =
    startLine.from +
    nextPrefixLength +
    clamp(
      selection.head - startLine.from - currentPrefixLength,
      0,
      currentContent.length,
    );

  return {
    markdown: nextMarkdown,
    selection: { anchor: nextAnchor, head: nextHead },
  };
}

export function insertCodeBlock(
  markdown: string,
  selection: SelectionSnapshot,
): ToolbarMutation {
  const range = normalizeSelection(markdown, selection);
  const selectedText = markdown.slice(range.from, range.to);
  const nextContent =
    selectedText.length > 0 ? `\`\`\`\n${selectedText}\n\`\`\`` : "```\n\n```";
  const nextMarkdown = replaceRange(
    markdown,
    range.from,
    range.to,
    nextContent,
  );
  const contentStart = range.from + 4;
  const contentEnd = contentStart + selectedText.length;

  return {
    markdown: nextMarkdown,
    selection:
      selectedText.length > 0
        ? preserveDirection(selection, contentStart, contentEnd)
        : { anchor: contentStart, head: contentStart },
  };
}

export function insertMarkdownImage(
  markdown: string,
  selection: SelectionSnapshot,
  image: { altText: string; src: string },
): ToolbarMutation {
  const range = normalizeSelection(markdown, selection);
  const nextContent = `![${image.altText}](${image.src})`;
  const nextMarkdown = replaceRange(
    markdown,
    range.from,
    range.to,
    nextContent,
  );
  const cursor = range.from + nextContent.length;

  return {
    markdown: nextMarkdown,
    selection: { anchor: cursor, head: cursor },
  };
}

export function insertMarkdownTable(
  markdown: string,
  selection: SelectionSnapshot,
): ToolbarMutation {
  const range = normalizeSelection(markdown, selection);
  const nextContent = [
    "| Column 1 | Column 2 |",
    "| --- | --- |",
    "| Cell 1 | Cell 2 |",
  ].join("\n");
  const nextMarkdown = replaceRange(
    markdown,
    range.from,
    range.to,
    nextContent,
  );
  const headerStart = range.from + 2;
  const headerEnd = headerStart + "Column 1".length;

  return {
    markdown: nextMarkdown,
    selection: { anchor: headerStart, head: headerEnd },
  };
}
