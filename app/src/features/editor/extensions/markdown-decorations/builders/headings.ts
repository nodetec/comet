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
      atomic: true,
      from: node.from,
      to: contentStart,
      decoration: Decoration.replace({}),
    });

    if (marks.length > 1) {
      // eslint-disable-next-line unicorn/prefer-at
      const lastMark = marks[marks.length - 1]!;
      out.push({
        atomic: true,
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
  const revealSyntax =
    onCursor || overlapsAny(node.from, node.to, ctx.searchMatches);

  if (!node.name.startsWith("ATX")) {
    return;
  }

  const headerMark = resolved.getChild("HeaderMark");
  if (
    !headerMark ||
    !isSpaceDelimitedATXHeading(ctx.state, headerMark.to, node.to)
  ) {
    return;
  }

  handleATXHeading(node, resolved, level, revealSyntax, out);
}
