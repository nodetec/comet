import type { EditorState } from "@codemirror/state";
import { Decoration } from "@codemirror/view";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type {
  BuilderContext,
  DecorationEntry,
} from "@/features/editor/extensions/markdown-decorations/types";

const HEADING_LEVEL: Record<string, number> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
  SetextHeading1: 1,
  SetextHeading2: 2,
};

const headingMarkCache = new Map<string, Decoration>();

function getHeadingMark(level: number): Decoration {
  const key = `h${level}`;
  let deco = headingMarkCache.get(key);
  if (!deco) {
    deco = Decoration.mark({ class: `cm-md-heading cm-md-h${level}` });
    headingMarkCache.set(key, deco);
  }
  return deco;
}

export function isSpaceDelimitedATXHeading(
  state: Pick<EditorState, "doc">,
  headerMarkTo: number,
  nodeTo: number,
): boolean {
  if (headerMarkTo >= nodeTo) {
    return false;
  }

  const nextCharacter = state.doc.sliceString(headerMarkTo, headerMarkTo + 1);
  return nextCharacter === " " || nextCharacter === "\t";
}

function handleATXHeading(
  node: SyntaxNodeRef,
  resolved: SyntaxNode,
  level: number,
  onCursor: boolean,
  out: DecorationEntry[],
): void {
  const marks = resolved.getChildren("HeaderMark");

  if (!onCursor && marks.length > 0) {
    const firstMark = marks[0]!;
    const contentStart = Math.min(firstMark.to + 1, node.to);
    out.push({
      from: node.from,
      to: contentStart,
      decoration: Decoration.replace({}),
    });

    if (marks.length > 1) {
      // eslint-disable-next-line unicorn/prefer-at
      const lastMark = marks[marks.length - 1]!;
      out.push({
        from: lastMark.from,
        to: lastMark.to,
        decoration: Decoration.replace({}),
      });
    }
  }

  out.push({
    from: node.from,
    to: node.to,
    decoration: getHeadingMark(level),
  });
}

function handleSetextHeading(
  node: SyntaxNodeRef,
  resolved: SyntaxNode,
  level: number,
  onCursor: boolean,
  out: DecorationEntry[],
): void {
  const headerMark = resolved.getChild("HeaderMark");
  if (!headerMark) {
    return;
  }

  const textEnd = headerMark.from > 0 ? headerMark.from - 1 : headerMark.from;
  if (node.from < textEnd) {
    out.push({
      from: node.from,
      to: textEnd,
      decoration: getHeadingMark(level),
    });
  }

  if (!onCursor) {
    out.push({
      from: headerMark.from,
      to: headerMark.to,
      decoration: Decoration.replace({}),
    });
  }
}

export function handleHeading(
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
): void {
  const level = HEADING_LEVEL[node.name];
  if (!level) {
    return;
  }

  const resolved = node.node;
  const onCursor = overlapsAny(node.from, node.to, ctx.cursorLines);

  if (node.name.startsWith("ATX")) {
    const headerMark = resolved.getChild("HeaderMark");
    if (
      !headerMark ||
      !isSpaceDelimitedATXHeading(ctx.state, headerMark.to, node.to)
    ) {
      return;
    }

    handleATXHeading(node, resolved, level, onCursor, out);
  } else {
    handleSetextHeading(node, resolved, level, onCursor, out);
  }
}
