import { syntaxTree } from "@codemirror/language";
import {
  EditorSelection,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Decoration, EditorView } from "@codemirror/view";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { utf8ByteOffsetForText } from "@/features/editor/lib/wikilinks";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";
import {
  dispatchCreateNoteFromWikilink,
  dispatchFocusNote,
} from "@/shared/lib/note-navigation";

type ExternalLinkTarget = {
  type: "external";
  url: string;
};

type WikiLinkTarget = {
  location: number;
  title: string;
  type: "wikilink";
};

type LinkTarget = ExternalLinkTarget | WikiLinkTarget;

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

export function resolveDraftWikiLinkTarget(
  noteId: string | null,
  target: WikiLinkTarget,
): string | null {
  if (!noteId) {
    return null;
  }

  const { draftNoteId, draftWikilinkResolutions } = useShellStore.getState();
  if (draftNoteId !== noteId) {
    return null;
  }

  return (
    draftWikilinkResolutions.find(
      (resolution) =>
        resolution.location === target.location &&
        resolution.title === target.title,
    )?.targetNoteId ?? null
  );
}

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
      atomic: true,
      from: openBracket.from,
      to: openBracket.to,
      decoration: Decoration.replace({}),
    });

    // Hide everything from `]` to end of node: `](url)` or `](url "title")`
    if (closeBracket.from < node.to) {
      out.push({
        atomic: true,
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

function findWikiLinkTargetAtPosition(
  state: EditorState,
  position: number,
  allowPreviousCharacterFallback: boolean,
): WikiLinkTarget | null {
  const candidates = new Set([position]);
  if (allowPreviousCharacterFallback) {
    candidates.add(Math.max(0, position - 1));
  }

  for (const candidate of candidates) {
    const resolved = syntaxTree(state).resolveInner(candidate, 0);

    for (let node: SyntaxNode | null = resolved; node; node = node.parent) {
      if (node.name !== "WikiLink") {
        continue;
      }

      const labelFrom = node.from + 2;
      const labelTo = node.to - 2;
      if (candidate < labelFrom || candidate >= labelTo) {
        continue;
      }

      const title = state.sliceDoc(labelFrom, labelTo).trim();
      if (!title) {
        return null;
      }

      return {
        location: utf8ByteOffsetForText(state.doc.toString(), node.from),
        title,
        type: "wikilink",
      };
    }
  }

  return null;
}

function shouldOpenLink(event: MouseEvent) {
  return event.button === 0;
}

function asExternalLinkTarget(url: string | null): ExternalLinkTarget | null {
  return url ? { type: "external", url } : null;
}

function getLinkTargetFromEvent(
  view: EditorView,
  event: MouseEvent,
): LinkTarget | null {
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
      return (
        findWikiLinkTargetAtPosition(view.state, position, false) ??
        asExternalLinkTarget(
          findExternalLinkTargetAtPosition(view.state, position, {
            allowPreviousCharacterFallback: false,
          }),
        )
      );
    }
  }

  try {
    const position = view.posAtDOM(target, 0);
    return (
      findWikiLinkTargetAtPosition(view.state, position, true) ??
      asExternalLinkTarget(
        findExternalLinkTargetAtPosition(view.state, position),
      )
    );
  } catch {
    return null;
  }
}

function getLinkEndAtCursor(state: EditorState, pos: number): number | null {
  const tree = syntaxTree(state);
  const node = tree.resolveInner(pos, 1);

  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (n.name === "WikiLink") {
      const wikilinkCloseBracket = n.to - 2;
      if (pos === wikilinkCloseBracket && n.to > pos) {
        return n.to;
      }
      continue;
    }

    if (!LINK_NODE_NAMES.has(n.name)) {
      continue;
    }

    const marks = n.getChildren("LinkMark");
    if (marks.length < 2) {
      continue;
    }

    const closeBracket = marks[1]!;
    if (pos === closeBracket.from && n.to > pos) {
      return n.to;
    }
  }

  return null;
}

async function openWikiLink(
  noteId: string | null,
  target: WikiLinkTarget,
): Promise<void> {
  if (!noteId) {
    console.warn("[wikilinks] clicked wikilink without active note id", target);
    return;
  }

  console.debug("[wikilinks] resolving wikilink", {
    location: target.location,
    sourceNoteId: noteId,
    title: target.title,
  });

  const draftResolvedNoteId = resolveDraftWikiLinkTarget(noteId, target);
  if (draftResolvedNoteId) {
    console.debug("[wikilinks] resolved wikilink from draft resolution", {
      location: target.location,
      resolvedNoteId: draftResolvedNoteId,
      sourceNoteId: noteId,
      title: target.title,
    });
    dispatchFocusNote(draftResolvedNoteId);
    return;
  }

  let resolvedNoteId: string | null;
  try {
    resolvedNoteId = await invoke<string | null>("resolve_wikilink", {
      input: {
        location: target.location,
        sourceNoteId: noteId,
        title: target.title,
      },
    });
  } catch (error) {
    console.error("[wikilinks] resolve_wikilink invoke failed", {
      error,
      location: target.location,
      sourceNoteId: noteId,
      title: target.title,
    });
    return;
  }

  if (resolvedNoteId) {
    console.debug("[wikilinks] resolved wikilink", {
      location: target.location,
      resolvedNoteId,
      sourceNoteId: noteId,
      title: target.title,
    });
    dispatchFocusNote(resolvedNoteId);
  } else {
    console.warn("[wikilinks] unresolved wikilink", {
      location: target.location,
      sourceNoteId: noteId,
      title: target.title,
    });
    dispatchCreateNoteFromWikilink({
      location: target.location,
      sourceNoteId: noteId,
      title: target.title,
    });
  }
}

export function linkInteractions(noteId: string | null): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      // When clicking to the right of a collapsed link, CM would place
      // the cursor before the hidden closing syntax. Intercept and place it
      // after the full link token instead.
      if (event.button === 0 && !event.shiftKey) {
        const contentRect = view.contentDOM.getBoundingClientRect();
        if (
          event.clientX >= contentRect.left &&
          event.clientX <= contentRect.right
        ) {
          const pos = view.posAtCoords(
            { x: event.clientX, y: event.clientY },
            false,
          );
          if (pos != null) {
            const linkEnd = getLinkEndAtCursor(view.state, pos);
            if (linkEnd != null) {
              event.preventDefault();
              view.dispatch({
                selection: EditorSelection.cursor(linkEnd),
                scrollIntoView: false,
              });
              view.focus();
              return true;
            }
          }
        }
      }

      if (!shouldOpenLink(event)) {
        return false;
      }

      const targetLink = getLinkTargetFromEvent(view, event);
      if (!targetLink) {
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

      const targetLink = getLinkTargetFromEvent(view, event);
      if (!targetLink) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      if (targetLink.type === "external") {
        void openUrl(targetLink.url).catch(() => {});
      } else {
        console.debug("[wikilinks] clicked wikilink target", targetLink);
        void openWikiLink(noteId, targetLink);
      }
      return true;
    },
  });
}
