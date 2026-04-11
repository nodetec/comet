import type { EditorSelection, EditorState } from "@codemirror/state";
import type { SyntaxNodeRef } from "@lezer/common";

export const BULLET_INDENT = 2;
export const ORDERED_INDENT = 3;
export const LIST_INDENT_STEP = "1.5rem";
export const LIST_MARKER_WIDTH = "2.8rem";
export const LIST_CHILD_BLOCK_OFFSET = LIST_MARKER_WIDTH;
export const LIST_SOURCE_INDENT_CHAR_WIDTH = "0.25rem";
export const BLOCKQUOTE_PREFIX_RE = /^(?:[ \t]{0,3}> ?)+/;
export const BULLET_MARKERS = new Set(["-", "*", "+"]);
export const LIST_PREFIX_RE = /^(\s*)([-*+]|\d+[.)]) (\[[ xX]\] )?/;
export const TASK_MARKERS = new Set(["[ ]", "[x]"]);

export type ListMarkerData = {
  indentLevel: number;
  lineStart: number;
  sourceIndentChars: number;
  marker: string;
  markerEnd: number;
  markerStart: number;
};

export type MarkerRange = {
  from: number;
  to: number;
};

export type HiddenPrefixRange = {
  from: number;
  to: number;
};

export type TaskListShortcut = {
  changes: {
    from: number;
    insert: string;
    to: number;
  };
  selection: EditorSelection;
};

export type ExplicitContinuationContext = {
  indentStyle: string;
  prefix: string;
};

export type ListMarkerNodeRef = Pick<
  SyntaxNodeRef,
  "from" | "to" | "type" | "node"
>;
export type DocLine = ReturnType<EditorState["doc"]["lineAt"]>;
