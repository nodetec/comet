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

export function clampSelection(
  selection: LocalSelection,
  textLength: number,
): LocalSelection {
  return {
    anchor: clamp(selection.anchor, 0, textLength),
    head: clamp(selection.head, 0, textLength),
  };
}
