import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension } from "@codemirror/state";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Decoration, EditorView } from "@codemirror/view";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const linkMark = Decoration.mark({ class: "cm-md-link" });
const LINK_NODE_NAMES = new Set(["Autolink", "Link"]);
const EXTERNAL_LINK_SCHEME_RE = /^(https?:|mailto:|tel:)/i;
const PLAIN_EXTERNAL_LINK_RE = /\b(?:https?:\/\/|mailto:|tel:)[^\s<]+/gi;
const TRAILING_PUNCTUATION = ".,!?;:";
const PLAIN_LINK_EXCLUDED_NODE_NAMES = new Set([
  "Autolink",
  "CodeBlock",
  "FencedCode",
  "Image",
  "InlineCode",
  "Link",
]);
const BRACKET_PAIRS: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

export function handleLink(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const resolved = node.node;
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorRanges);
  const marks = resolved.getChildren("LinkMark");

  if (marks.length < 2) {
    return;
  }

  // Apply link styling to visible text (between first [ and first ])
  const openBracket = marks[0]!;
  const closeBracket = marks[1]!;
  const textFrom = openBracket.to;
  const textTo = closeBracket.from;

  if (textFrom < textTo) {
    out.push({ from: textFrom, to: textTo, decoration: linkMark });
  }

  // Hide syntax when off cursor line
  if (!onCursor) {
    // Hide opening `[`
    out.push({
      from: openBracket.from,
      to: openBracket.to,
      decoration: Decoration.replace({}),
    });

    // Hide everything from `]` to end of node: `](url)` or `](url "title")`
    if (closeBracket.from < node.to) {
      out.push({
        from: closeBracket.from,
        to: node.to,
        decoration: Decoration.replace({}),
      });
    }
  }
}

function trimPlainExternalLink(match: string): string {
  let trimmed = match;

  while (trimmed.length > 0) {
    if (shouldTrimTrailingPunctuation(trimmed)) {
      trimmed = trimmed.slice(0, -1);
      continue;
    }

    if (shouldTrimTrailingBracket(trimmed)) {
      trimmed = trimmed.slice(0, -1);
      continue;
    }

    break;
  }

  return trimmed;
}

function getLastCharacter(value: string): string | null {
  return value.length > 0 ? value.slice(-1) : null;
}

function shouldTrimTrailingPunctuation(value: string): boolean {
  const lastCharacter = getLastCharacter(value);
  return lastCharacter != null && TRAILING_PUNCTUATION.includes(lastCharacter);
}

function shouldTrimTrailingBracket(value: string): boolean {
  const lastCharacter = getLastCharacter(value);
  if (!lastCharacter) {
    return false;
  }

  const openingCharacter = BRACKET_PAIRS[lastCharacter];
  if (!openingCharacter) {
    return false;
  }

  const openingCount = [...value].filter(
    (character) => character === openingCharacter,
  ).length;
  const closingCount = [...value].filter(
    (character) => character === lastCharacter,
  ).length;

  return closingCount > openingCount;
}

function isInsidePlainLinkExcludedSyntax(
  tree: ReturnType<typeof syntaxTree>,
  position: number,
): boolean {
  const resolved = tree.resolveInner(position, 1);

  for (let node: SyntaxNode | null = resolved; node; node = node.parent) {
    if (PLAIN_LINK_EXCLUDED_NODE_NAMES.has(node.name)) {
      return true;
    }
  }

  return false;
}

export function addPlainExternalLinkDecorations(
  ctx: BuilderContext,
  out: DecorationEntry[],
  ranges: readonly { from: number; to: number }[],
): void {
  const tree = syntaxTree(ctx.state);

  for (const range of ranges) {
    const slice = ctx.state.doc.sliceString(range.from, range.to);
    for (const match of slice.matchAll(PLAIN_EXTERNAL_LINK_RE)) {
      if (match.index == null) {
        continue;
      }

      const rawTarget = match[0];
      const target = trimPlainExternalLink(rawTarget);
      if (target.length === 0) {
        continue;
      }

      const from = range.from + match.index;
      const to = from + target.length;

      if (
        isInsidePlainLinkExcludedSyntax(tree, from) ||
        isInsidePlainLinkExcludedSyntax(tree, to - 1)
      ) {
        continue;
      }

      out.push({ from, to, decoration: linkMark });
    }
  }
}

function getExternalLinkTargetFromNode(
  state: EditorState,
  node: SyntaxNode,
): string | null {
  const urlNode = node.getChild("URL");
  if (!urlNode) {
    return null;
  }

  const url = state.sliceDoc(urlNode.from, urlNode.to).trim();
  return EXTERNAL_LINK_SCHEME_RE.test(url) ? url : null;
}

function isVisibleLinkPosition(node: SyntaxNode, position: number): boolean {
  if (node.name === "Link") {
    const marks = node.getChildren("LinkMark");
    if (marks.length < 2) {
      return false;
    }

    return position >= marks[0]!.to && position < marks[1]!.from;
  }

  if (node.name === "Autolink") {
    const urlNode = node.getChild("URL");
    return urlNode ? position >= urlNode.from && position < urlNode.to : false;
  }

  return false;
}

function findSyntaxTreeLinkTargetAtPosition(
  state: EditorState,
  position: number,
  allowPreviousCharacterFallback: boolean,
): string | null {
  const candidates = new Set([position]);
  if (allowPreviousCharacterFallback) {
    candidates.add(Math.max(0, position - 1));
  }

  for (const candidate of candidates) {
    const resolved = syntaxTree(state).resolveInner(candidate, 0);

    for (let node: SyntaxNode | null = resolved; node; node = node.parent) {
      if (!LINK_NODE_NAMES.has(node.name)) {
        continue;
      }

      if (!isVisibleLinkPosition(node, candidate)) {
        continue;
      }

      return getExternalLinkTargetFromNode(state, node);
    }
  }

  return null;
}

function findPlainExternalLinkTargetAtPosition(
  state: EditorState,
  position: number,
): string | null {
  const line = state.doc.lineAt(position);
  const offset = position - line.from;
  const tree = syntaxTree(state);

  for (const match of line.text.matchAll(PLAIN_EXTERNAL_LINK_RE)) {
    if (match.index == null) {
      continue;
    }

    const rawTarget = match[0];
    const target = trimPlainExternalLink(rawTarget);
    if (target.length === 0) {
      continue;
    }

    const from = match.index;
    const to = from + target.length;
    if (offset < from || offset >= to) {
      continue;
    }

    const absoluteFrom = line.from + from;
    const absoluteTo = line.from + to;
    if (
      isInsidePlainLinkExcludedSyntax(tree, absoluteFrom) ||
      isInsidePlainLinkExcludedSyntax(tree, absoluteTo - 1)
    ) {
      continue;
    }

    return target;
  }

  return null;
}

export function findExternalLinkTargetAtPosition(
  state: EditorState,
  position: number,
  options: {
    allowPreviousCharacterFallback?: boolean;
  } = {},
): string | null {
  return (
    findSyntaxTreeLinkTargetAtPosition(
      state,
      position,
      options.allowPreviousCharacterFallback ?? true,
    ) ?? findPlainExternalLinkTargetAtPosition(state, position)
  );
}

function shouldOpenLink(event: MouseEvent) {
  return event.button === 0;
}

function getExternalLinkTargetFromEvent(
  view: EditorView,
  event: MouseEvent,
): string | null {
  const { target } = event;
  if (!(target instanceof Node) || !view.contentDOM.contains(target)) {
    return null;
  }

  const hasPointerCoordinates = event.clientX !== 0 || event.clientY !== 0;
  if (hasPointerCoordinates) {
    const contentRect = view.contentDOM.getBoundingClientRect();
    if (event.clientX < contentRect.left || event.clientX > contentRect.right) {
      return null;
    }

    const position = view.posAtCoords(
      { x: event.clientX, y: event.clientY },
      false,
    );
    if (position != null) {
      return findExternalLinkTargetAtPosition(view.state, position, {
        allowPreviousCharacterFallback: false,
      });
    }
  }

  try {
    return findExternalLinkTargetAtPosition(
      view.state,
      view.posAtDOM(target, 0),
    );
  } catch {
    return null;
  }
}

export function linkInteractions(): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!shouldOpenLink(event)) {
        return false;
      }

      const targetUrl = getExternalLinkTargetFromEvent(view, event);
      if (!targetUrl) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    click(event, view) {
      if (!shouldOpenLink(event) || !view.state.selection.main.empty) {
        return false;
      }

      const targetUrl = getExternalLinkTargetFromEvent(view, event);
      if (!targetUrl) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      void openUrl(targetUrl).catch(() => {});
      return true;
    },
  });
}
