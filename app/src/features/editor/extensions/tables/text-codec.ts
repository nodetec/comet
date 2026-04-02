import type { LocalSelection } from "@/features/editor/extensions/tables/types";

const NON_CANONICAL_BR_PATTERN = /<br\s*\/>/gi;
const LINE_BREAK_PATTERN = /\r\n|\n|\r/g;
const UNESCAPED_PIPE_PATTERN = /(?<!\\)(\\\\)*\|/g;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeBrTags(text: string): string {
  return text.replace(NON_CANONICAL_BR_PATTERN, "<br>");
}

export function unsanitizeRootText(rootText: string): string {
  return rootText
    .split("<br>")
    .join("\n")
    .split(String.raw`\|`)
    .join("|");
}

export function sanitizeLocalText(localText: string): string {
  return normalizeBrTags(localText)
    .replace(LINE_BREAK_PATTERN, "<br>")
    .replace(UNESCAPED_PIPE_PATTERN, String.raw`\$&`);
}

function toLocalOffset(rootText: string, rootOffset: number): number {
  const clampedOffset = clamp(rootOffset, 0, rootText.length);
  let localOffset = 0;
  let rootIndex = 0;

  while (rootIndex < clampedOffset) {
    if (rootText.startsWith("<br>", rootIndex)) {
      const nextIndex = rootIndex + 4;
      if (nextIndex > clampedOffset) {
        break;
      }
      localOffset += 1;
      rootIndex = nextIndex;
      continue;
    }

    if (rootText.startsWith(String.raw`\|`, rootIndex)) {
      const nextIndex = rootIndex + 2;
      if (nextIndex > clampedOffset) {
        break;
      }
      localOffset += 1;
      rootIndex = nextIndex;
      continue;
    }

    localOffset += 1;
    rootIndex += 1;
  }

  return localOffset;
}

function toRootOffset(localText: string, localOffset: number): number {
  return sanitizeLocalText(
    localText.slice(0, clamp(localOffset, 0, localText.length)),
  ).length;
}

export function toLocalSelection(
  rootSelection: LocalSelection,
  rootText: string,
): LocalSelection {
  return {
    anchor: toLocalOffset(rootText, rootSelection.anchor),
    head: toLocalOffset(rootText, rootSelection.head),
  };
}

export function toRootSelection(
  localSelection: LocalSelection,
  localText: string,
): LocalSelection {
  return {
    anchor: toRootOffset(localText, localSelection.anchor),
    head: toRootOffset(localText, localSelection.head),
  };
}

export function clampSelection(
  selection: LocalSelection,
  textLength: number,
): LocalSelection {
  return {
    anchor: clamp(selection.anchor, 0, textLength),
    head: clamp(selection.head, 0, textLength),
  };
}
