import type { Decoration, EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";

export type DecorationEntry = {
  from: number;
  to: number;
  decoration: Decoration;
};

export type LineRange = {
  from: number;
  to: number;
};

export type BuilderContext = {
  state: EditorState;
  /** Line-expanded ranges — used by headings (reveal on cursor-line). */
  cursorLines: LineRange[];
  /** Raw cursor/selection ranges — used by inline elements (reveal on element). */
  cursorRanges: LineRange[];
  /** Search matches that should reveal transformed markdown source. */
  searchMatches: LineRange[];
  view: EditorView;
};

export type NodeHandler = (
  node: SyntaxNodeRef,
  ctx: BuilderContext,
  out: DecorationEntry[],
) => void;
