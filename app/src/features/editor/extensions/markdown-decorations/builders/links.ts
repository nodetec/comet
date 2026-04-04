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
): void {
  const doc = ctx.state.doc.toString();
  const tree = syntaxTree(ctx.state);

  for (const match of doc.matchAll(PLAIN_EXTERNAL_LINK_RE)) {
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

    if (
      isInsidePlainLinkExcludedSyntax(tree, from) ||
      isInsidePlainLinkExcludedSyntax(tree, to - 1)
    ) {
      continue;
    }

    out.push({ from, to, decoration: linkMark });
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

export function findExternalLinkTargetAtPosition(
  state: EditorState,
  position: number,
): string | null {
  const candidates = new Set([position, Math.max(0, position - 1)]);

  for (const candidate of candidates) {
    const resolved = syntaxTree(state).resolveInner(candidate, 0);

    for (let node: SyntaxNode | null = resolved; node; node = node.parent) {
      if (!LINK_NODE_NAMES.has(node.name)) {
        continue;
      }

      return getExternalLinkTargetFromNode(state, node);
    }
  }

  const line = state.doc.lineAt(position);
  const offset = position - line.from;

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
    if (offset < from || offset > to) {
      continue;
    }

    const absoluteFrom = line.from + from;
    const absoluteTo = line.from + to;
    const tree = syntaxTree(state);
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

function shouldOpenLink(event: MouseEvent) {
  return event.button === 0;
}

function getExternalLinkTargetFromEvent(
  view: EditorView,
  target: EventTarget | null,
): string | null {
  if (!(target instanceof Node) || !view.contentDOM.contains(target)) {
    return null;
  }

  try {
    const position = view.posAtDOM(target, 0);
    return findExternalLinkTargetAtPosition(view.state, position);
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

      const targetUrl = getExternalLinkTargetFromEvent(view, event.target);
      if (!targetUrl) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    click(event, view) {
      if (!shouldOpenLink(event)) {
        return false;
      }

      const targetUrl = getExternalLinkTargetFromEvent(view, event.target);
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
