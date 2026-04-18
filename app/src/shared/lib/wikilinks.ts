export type WikiLinkCompletionContext = {
  from: number;
  hasClosingBrackets: boolean;
  matchingString: string;
  to: number;
};

export type WikiLinkOccurrence = {
  location: number;
  title: string;
};

const textEncoder = new TextEncoder();

export function utf8ByteOffsetForText(text: string, offset: number): number {
  if (offset <= 0) {
    return 0;
  }

  return textEncoder.encode(text.slice(0, offset)).length;
}

function isSquareBracketEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  let current = index;

  while (current > 0 && text[current - 1] === "\\") {
    slashCount += 1;
    current -= 1;
  }

  return slashCount % 2 === 1;
}

function fenceMarkerIndexAtLineStart(
  text: string,
  index: number,
  atLineStart: boolean,
): number | null {
  if (!atLineStart) {
    return null;
  }

  let fenceIndex = index;
  let spaces = 0;
  while (fenceIndex < text.length && text[fenceIndex] === " " && spaces < 3) {
    fenceIndex += 1;
    spaces += 1;
  }

  const marker = text[fenceIndex];
  if (
    (marker === "`" || marker === "~") &&
    text[fenceIndex + 1] === marker &&
    text[fenceIndex + 2] === marker
  ) {
    return fenceIndex;
  }

  return null;
}

function advanceToLineEnd(text: string, index: number): number {
  let nextIndex = index;
  while (nextIndex < text.length && text[nextIndex] !== "\n") {
    nextIndex += 1;
  }
  return nextIndex;
}

function countRepeatedCharacter(
  text: string,
  index: number,
  character: string,
): number {
  let count = 0;
  while (text[index + count] === character) {
    count += 1;
  }
  return count;
}

function consumeFenceTransition(
  markdown: string,
  index: number,
  fenceChar: string,
  fenceLength: number,
): { fenceChar: string; fenceLength: number; nextIndex: number } | null {
  const atLineStart = index === 0 || markdown[index - 1] === "\n";
  const fenceIndex = fenceMarkerIndexAtLineStart(markdown, index, atLineStart);

  if (fenceIndex === null) {
    return null;
  }

  const marker = markdown[fenceIndex];
  const run = countRepeatedCharacter(markdown, fenceIndex, marker);

  if (fenceLength === 0) {
    return {
      fenceChar: marker,
      fenceLength: run,
      nextIndex: advanceToLineEnd(markdown, fenceIndex + run),
    };
  }

  if (marker === fenceChar && run >= fenceLength) {
    return {
      fenceChar: "",
      fenceLength: 0,
      nextIndex: advanceToLineEnd(markdown, fenceIndex + run),
    };
  }

  return {
    fenceChar,
    fenceLength,
    nextIndex: advanceToLineEnd(markdown, fenceIndex + run),
  };
}

function consumeInlineCode(markdown: string, index: number): number | null {
  if (markdown[index] !== "`") {
    return null;
  }

  const tickCount = countRepeatedCharacter(markdown, index, "`");
  let nextIndex = index + tickCount;

  while (nextIndex < markdown.length) {
    if (markdown[nextIndex] !== "`") {
      nextIndex += 1;
      continue;
    }

    const closeCount = countRepeatedCharacter(markdown, nextIndex, "`");
    nextIndex += closeCount;
    if (closeCount === tickCount) {
      return nextIndex;
    }
  }

  // Unclosed inline code — skip only the opening backticks so wikilinks
  // after them are still extracted.
  return index + tickCount;
}

function parseWikiLinkOccurrence(
  markdown: string,
  index: number,
): { nextIndex: number; occurrence: WikiLinkOccurrence } | null {
  if (
    markdown[index] !== "[" ||
    markdown[index + 1] !== "[" ||
    isSquareBracketEscaped(markdown, index)
  ) {
    return null;
  }

  const closeIndex = markdown.indexOf("]]", index + 2);
  if (closeIndex === -1) {
    return null;
  }

  const rawTitle = markdown.slice(index + 2, closeIndex).trim();
  if (!isRepresentableWikiLinkTitle(rawTitle)) {
    return null;
  }

  return {
    nextIndex: closeIndex + 2,
    occurrence: {
      location: utf8ByteOffsetForText(markdown, index),
      title: rawTitle,
    },
  };
}

function findLastUnescapedWikiLinkOpen(
  text: string,
  cursorOffset: number,
): number | null {
  let searchIndex = cursorOffset;

  while (searchIndex >= 0) {
    const openIndex = text.lastIndexOf("[[", searchIndex);
    if (openIndex === -1) {
      return null;
    }

    if (!isSquareBracketEscaped(text, openIndex)) {
      return openIndex;
    }

    searchIndex = openIndex - 1;
  }

  return null;
}

function readWikiLinkCompletionTail(
  text: string,
  cursorOffset: number,
): { hasClosingBrackets: boolean; labelEnd: number } | null {
  let labelEnd = cursorOffset;
  let hasClosingBrackets = false;

  while (labelEnd < text.length) {
    if (text.slice(labelEnd, labelEnd + 2) === "]]") {
      hasClosingBrackets = true;
      break;
    }

    const character = text[labelEnd];
    if ("[]\n\r".includes(character)) {
      return null;
    }

    labelEnd += 1;
  }

  return { hasClosingBrackets, labelEnd };
}

export function isRepresentableWikiLinkTitle(title: string): boolean {
  const normalizedTitle = title.trim();

  return (
    normalizedTitle.length > 0 &&
    !normalizedTitle.includes("[") &&
    !normalizedTitle.includes("]") &&
    !normalizedTitle.includes("\n") &&
    !normalizedTitle.includes("\r")
  );
}

export function normalizeWikiLinkTitle(title: string): string | null {
  const normalizedTitle = title
    .split(/\s+/u)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return normalizedTitle.length > 0 ? normalizedTitle : null;
}

export function extractWikiLinkOccurrences(
  markdown: string,
): WikiLinkOccurrence[] {
  const occurrences: WikiLinkOccurrence[] = [];
  let fenceChar = "";
  let fenceLength = 0;
  let index = 0;

  while (index < markdown.length) {
    const fenceTransition = consumeFenceTransition(
      markdown,
      index,
      fenceChar,
      fenceLength,
    );
    if (fenceTransition) {
      fenceChar = fenceTransition.fenceChar;
      fenceLength = fenceTransition.fenceLength;
      index = fenceTransition.nextIndex;
      continue;
    }

    if (fenceLength > 0) {
      index += 1;
      continue;
    }

    const nextInlineCodeIndex = consumeInlineCode(markdown, index);
    if (nextInlineCodeIndex !== null) {
      index = nextInlineCodeIndex;
      continue;
    }

    const parsedOccurrence = parseWikiLinkOccurrence(markdown, index);
    if (parsedOccurrence) {
      occurrences.push(parsedOccurrence.occurrence);
      index = parsedOccurrence.nextIndex;
      continue;
    }

    index += 1;
  }

  return occurrences;
}

export function matchWikiLinkCompletionAtCursor(
  text: string,
  cursorOffset: number,
): WikiLinkCompletionContext | null {
  const openIndex = findLastUnescapedWikiLinkOpen(text, cursorOffset);
  if (openIndex === null) {
    return null;
  }

  const beforeCursor = text.slice(openIndex + 2, cursorOffset);
  if (beforeCursor.includes("[") || beforeCursor.includes("]")) {
    return null;
  }

  const completionTail = readWikiLinkCompletionTail(text, cursorOffset);
  if (!completionTail) {
    return null;
  }

  const afterCursor = text.slice(cursorOffset, completionTail.labelEnd);

  return {
    from: openIndex + 2,
    hasClosingBrackets: completionTail.hasClosingBrackets,
    matchingString: `${beforeCursor}${afterCursor}`,
    to: completionTail.labelEnd + (completionTail.hasClosingBrackets ? 2 : 0),
  };
}
