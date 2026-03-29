export type TagEntityMatch = {
  end: number;
  start: number;
};

export type TagCompletionMatch = {
  leadOffset: number;
  matchingString: string;
  replaceableLength: number;
};

function isTagSegmentChar(character: string) {
  return /[\p{L}\p{N}_-]/u.test(character);
}

function isWrappedTagBodyChar(character: string) {
  return (
    character !== "\n" &&
    character !== "\r" &&
    (isTagSegmentChar(character) || character === "/" || /\s/u.test(character))
  );
}

function isEscapedHash(text: string, index: number) {
  let slashCount = 0;
  let current = index;

  while (current > 0 && text[current - 1] === "\\") {
    slashCount += 1;
    current -= 1;
  }

  return slashCount % 2 === 1;
}

function hasValidBoundary(text: string, hashIndex: number) {
  const previous = text[hashIndex - 1];
  if (previous == null) {
    return true;
  }

  return !(
    isTagSegmentChar(previous) ||
    previous === "/" ||
    previous === ":" ||
    previous === "."
  );
}

function hasInvalidWrappedTrailingBoundary(text: string, nextIndex: number) {
  const next = text[nextIndex];
  return (
    next != null &&
    (isTagSegmentChar(next) || next === "/" || next === ":" || next === ".")
  );
}

function resolveWrappedTagMatch(
  text: string,
  startIndex: number,
  rest: string,
  offset: number,
): TagEntityMatch | null {
  if (offset === 0) {
    return null;
  }

  const candidate = rest.slice(0, offset);
  if (!canonicalizeTagPath(candidate)) {
    return null;
  }

  const end = startIndex + 1 + offset + 1;
  if (hasInvalidWrappedTrailingBoundary(text, end)) {
    return null;
  }

  return { start: startIndex, end };
}

function hasInvalidSimpleTrailingText(text: string, endIndex: number) {
  const next = text[endIndex];
  if (next == null || !/\s/u.test(next)) {
    return false;
  }

  for (let index = endIndex + 1; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === "\n" || character === "\r") {
      return false;
    }
    if (/\s/u.test(character)) {
      continue;
    }
    return (
      character !== "#" && (isTagSegmentChar(character) || character === "/")
    );
  }

  return false;
}

export function canonicalizeTagPath(raw: string): string | null {
  const segments = raw.split("/");
  const canonicalSegments: string[] = [];

  for (const segment of segments) {
    const normalized = segment.trim().split(/\s+/u).filter(Boolean).join(" ");
    if (!normalized) {
      return null;
    }

    let hasLetter = false;
    for (const character of normalized) {
      if (/\p{L}/u.test(character)) {
        hasLetter = true;
      }

      if (!(isTagSegmentChar(character) || character === " ")) {
        return null;
      }
    }

    if (!hasLetter) {
      return null;
    }

    canonicalSegments.push(normalized.toLocaleLowerCase());
  }

  if (canonicalSegments.length === 0) {
    return null;
  }

  return canonicalSegments.join("/");
}

export function renderTagToken(path: string): string | null {
  const canonical = canonicalizeTagPath(path);
  if (!canonical) {
    return null;
  }
  return canonical.includes(" ") ? `#${canonical}#` : `#${canonical}`;
}

function parseWrappedTag(
  text: string,
  startIndex: number,
): TagEntityMatch | null {
  const rest = text.slice(startIndex + 1);
  let sawAny = false;

  for (let offset = 0; offset < rest.length; offset += 1) {
    const character = rest[offset]!;
    if (!sawAny && /\s/u.test(character)) {
      return null;
    }

    if (character === "#") {
      return resolveWrappedTagMatch(text, startIndex, rest, offset);
    }

    if (!isWrappedTagBodyChar(character)) {
      return null;
    }

    sawAny = true;
  }

  return null;
}

function parseSimpleTag(
  text: string,
  startIndex: number,
): TagEntityMatch | null {
  let end = startIndex + 1;

  while (end < text.length) {
    const character = text[end]!;
    if (isTagSegmentChar(character) || character === "/") {
      end += 1;
      continue;
    }
    break;
  }

  if (end === startIndex + 1) {
    return null;
  }

  const candidate = text.slice(startIndex + 1, end);
  if (!canonicalizeTagPath(candidate)) {
    return null;
  }

  if (hasInvalidSimpleTrailingText(text, end)) {
    return null;
  }

  return { start: startIndex, end };
}

export function findTagEntityMatch(text: string): TagEntityMatch | null {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "#") {
      continue;
    }

    if (isEscapedHash(text, index) || !hasValidBoundary(text, index)) {
      continue;
    }

    const wrapped = parseWrappedTag(text, index);
    if (wrapped) {
      return wrapped;
    }

    const simple = parseSimpleTag(text, index);
    if (simple) {
      return simple;
    }
  }

  return null;
}

export function canonicalizeTagPartial(raw: string): string | null {
  if (!raw || /^\s/u.test(raw)) {
    return null;
  }

  const endsWithSlash = /\/\s*$/u.test(raw);
  const segments = raw.split("/");
  const canonicalSegments: string[] = [];

  for (const [index, segment] of segments.entries()) {
    const normalized = segment.trim().split(/\s+/u).filter(Boolean).join(" ");
    const isLast = index === segments.length - 1;

    if (!normalized) {
      if (isLast && endsWithSlash) {
        canonicalSegments.push("");
        continue;
      }
      return null;
    }

    for (const character of normalized) {
      if (!(isTagSegmentChar(character) || character === " ")) {
        return null;
      }
    }

    canonicalSegments.push(normalized.toLocaleLowerCase());
  }

  let canonical = canonicalSegments.join("/");
  if (endsWithSlash && !canonical.endsWith("/")) {
    canonical += "/";
  }

  return canonical;
}

export function matchTagCompletionAtEnd(
  textUpToCursor: string,
): TagCompletionMatch | null {
  const hashIndex = textUpToCursor.lastIndexOf("#");
  if (hashIndex === -1) {
    return null;
  }

  if (
    isEscapedHash(textUpToCursor, hashIndex) ||
    !hasValidBoundary(textUpToCursor, hashIndex)
  ) {
    return null;
  }

  const body = textUpToCursor.slice(hashIndex + 1);
  if (body.includes("#") || body.includes("\n") || body.includes("\r")) {
    return null;
  }

  if (!body) {
    return null;
  }

  const canonical = canonicalizeTagPartial(body);
  if (!canonical) {
    return null;
  }

  return {
    matchingString: canonical,
    leadOffset: hashIndex,
    replaceableLength: textUpToCursor.length - hashIndex,
  };
}
