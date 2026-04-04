import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  selectAll,
  undo,
} from "@codemirror/commands";
import {
  markdown as markdownLanguage,
  markdownKeymap,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import {
  Strikethrough,
  Table,
  TaskList,
  type MarkdownConfig,
} from "@lezer/markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
  SearchQuery,
  closeSearchPanel,
  getSearchQuery,
  openSearchPanel,
  search,
  searchPanelOpen,
  setSearchQuery,
} from "@codemirror/search";
import {
  Compartment,
  EditorSelection,
  type SelectionRange,
  EditorState,
  Transaction,
} from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { Vim, vim } from "@replit/codemirror-vim";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";

import {
  DEFAULT_TOOLBAR_STATE,
  cycleBlockType,
  getToolbarState,
  insertCodeBlock,
  insertMarkdownImage,
  insertMarkdownTable,
  toggleInlineFormat,
  type InlineFormat,
  type SelectionSnapshot,
} from "@/features/editor/lib/toolbar-state";
import { EditorToolbar } from "@/features/editor/ui/editor-toolbar";
import {
  isEditorFindShortcut,
  isNotesSearchShortcut,
} from "@/shared/lib/keyboard";
import {
  IMAGE_EXTENSIONS,
  importImage,
  unresolveImageSrc,
} from "@/shared/lib/attachments";
import { logEditorDebug, summarizeRanges } from "@/shared/lib/editor-debug";
import { collectSearchMatches } from "@/shared/lib/search";

function getEditorScrollContainer(view: EditorView): HTMLElement {
  return (
    (view.dom.closest("[data-editor-scroll-container]") as HTMLElement) ??
    view.scrollDOM
  );
}

function centerEditorPositionInView(view: EditorView, position: number) {
  view.requestMeasure<{
    scrollContainer: HTMLElement;
    targetScrollTop: number;
  } | null>({
    key: `center-search-match-${position}`,
    read(view) {
      const scrollContainer = getEditorScrollContainer(view);
      const block = view.lineBlockAt(position);
      const containerRect = scrollContainer.getBoundingClientRect();
      const blockMidpoint = view.documentTop + block.top + block.height / 2;
      const viewportMidpoint = containerRect.top + containerRect.height / 2;
      const targetScrollTop = Math.max(
        0,
        scrollContainer.scrollTop + (blockMidpoint - viewportMidpoint),
      );

      return {
        scrollContainer,
        targetScrollTop,
      };
    },
    write(measure) {
      if (!measure) {
        return;
      }

      measure.scrollContainer.scrollTop = measure.targetScrollTop;
    },
  });
}

function revealEditorPositionIfNeeded(view: EditorView, position: number) {
  view.requestMeasure<{
    scrollContainer: HTMLElement;
    targetScrollTop: number;
  } | null>({
    key: `reveal-search-match-${position}`,
    read(view) {
      const scrollContainer = getEditorScrollContainer(view);
      const positionRect =
        view.coordsAtPos(position, 1) ?? view.coordsAtPos(position, -1);
      const containerRect = scrollContainer.getBoundingClientRect();
      const isVisible = positionRect
        ? positionRect.bottom > containerRect.top &&
          positionRect.top < containerRect.bottom
        : false;

      if (isVisible) {
        return null;
      }

      const block = view.lineBlockAt(position);
      const blockMidpoint = view.documentTop + block.top + block.height / 2;
      const viewportMidpoint = containerRect.top + containerRect.height / 2;
      const targetScrollTop = Math.max(
        0,
        scrollContainer.scrollTop + (blockMidpoint - viewportMidpoint),
      );

      return {
        scrollContainer,
        targetScrollTop,
      };
    },
    write(measure) {
      if (!measure) {
        return;
      }

      measure.scrollContainer.scrollTop = measure.targetScrollTop;
    },
  });
}

function buildSearchAwarePresentationExtensions(searchQuery: string) {
  return [inlineImages({ searchQuery }), markdownDecorations({ searchQuery })];
}

Vim.defineAction("scrollPageDown", (cm: { cm6: EditorView }) => {
  const view = cm.cm6;
  const el = getEditorScrollContainer(view);
  const pageHeight = el.clientHeight;
  el.scrollBy({ top: pageHeight, behavior: "smooth" });
  const targetTop = el.scrollTop + pageHeight;
  const pos = view.lineBlockAtHeight(targetTop - view.documentTop).from;
  view.dispatch({ selection: EditorSelection.cursor(pos) });
});
Vim.defineAction("scrollPageUp", (cm: { cm6: EditorView }) => {
  const view = cm.cm6;
  const el = getEditorScrollContainer(view);
  const pageHeight = el.clientHeight;
  el.scrollBy({ top: -pageHeight, behavior: "smooth" });
  const targetTop = Math.max(0, el.scrollTop - pageHeight);
  const pos = view.lineBlockAtHeight(targetTop - view.documentTop).from;
  view.dispatch({ selection: EditorSelection.cursor(pos) });
});
Vim.mapCommand("<C-j>", "action", "scrollPageDown", {}, { context: "normal" });
Vim._mapCommand({
  keys: "<C-k>",
  type: "action",
  action: "scrollPageUp",
  actionArgs: {},
  context: "normal",
} as never);

import { inlineImages } from "@/features/editor/extensions/inline-images";
import {
  HighlightSyntax,
  markdownDecorations,
} from "@/features/editor/extensions/markdown-decorations";
import {
  TagGrammar,
  tagHighlightStyle,
} from "@/features/editor/extensions/markdown-decorations/tag-syntax";
import { scrollCenterOnEnter } from "@/features/editor/extensions/scroll-center-on-enter";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { cn } from "@/shared/lib/utils";

type NoteEditorProps = {
  autoFocus?: boolean;
  loadKey: string;
  markdown: string;
  onAutoFocusHandled?(): void;
  onEditorFocusChange?(focused: boolean): void;
  onSearchMatchCountChange?(count: number): void;
  readOnly: boolean;
  searchHighlightAllMatchesYellow?: boolean;
  searchActiveMatchIndex?: number | null;
  searchQuery: string;
  searchScrollRevision?: number;
  spellCheck?: boolean;
  toolbarContainer?: HTMLElement | null;
  vimMode?: boolean;
  onChange(markdown: string): void;
};

export type NoteEditorHandle = {
  blur(): void;
  focus(): void;
  redo(): boolean;
  undo(): boolean;
};

type GutterSide = "left" | "right";
type DragPointerState = {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
};

const MARKDOWN_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "700" },
  {
    tag: [t.monospace, t.literal],
    fontFamily:
      '"SF Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  { tag: [t.link, t.url], color: "var(--primary)" },
  { tag: [t.quote], color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [t.comment], color: "var(--syntax-comment)" },
  {
    tag: [t.keyword, t.operatorKeyword, t.controlKeyword, t.modifier],
    color: "var(--syntax-keyword)",
  },
  {
    tag: [t.typeName, t.className, t.namespace],
    color: "var(--syntax-type)",
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    color: "var(--syntax-function)",
  },
  {
    tag: [t.propertyName, t.attributeName],
    color: "var(--syntax-attribute)",
  },
  {
    tag: [t.number, t.integer, t.float],
    color: "var(--syntax-number)",
  },
  {
    tag: [t.string, t.special(t.string)],
    color: "var(--syntax-string)",
  },
  { tag: [t.regexp], color: "var(--syntax-regex)" },
  {
    tag: [t.bool, t.null, t.atom, t.labelName, t.constant(t.name)],
    color: "var(--syntax-constant)",
  },
  {
    tag: [t.tagName, t.special(t.tagName)],
    color: "var(--syntax-selector)",
  },
  { tag: [t.meta], color: "var(--syntax-atrule)" },
  { tag: [t.processingInstruction], color: "var(--muted-foreground)" },
  { tag: [t.contentSeparator], color: "var(--muted-foreground)" },
]);

const MARKDOWN_EDITOR_THEME = EditorView.theme({
  "&": {
    minHeight: "100%",
    background: "transparent",
    cursor: "text",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    minHeight: "100%",
    overflow: "visible",
    fontFamily: '"Figtree Variable", sans-serif',
    cursor: "text",
  },
  ".cm-content": {
    minHeight: "100%",
    color: "var(--editor-text)",
    caretColor: "var(--editor-caret)",
    cursor: "text",
  },
  ".cm-line": {
    paddingBlock: "0",
    paddingLeft: "0",
    paddingRight: "0",
    cursor: "text",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--editor-caret)",
    borderLeftWidth: "1.5px",
    // marginTop: "-5px",
    // marginBottom: "-5px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
  },
  ".cm-selectionLayer": {
    zIndex: "1 !important",
    pointerEvents: "none",
  },
  ".cm-cursorLayer": {
    zIndex: "2 !important",
  },
  "&.cm-focused .cm-content ::selection": {
    backgroundColor: "transparent !important",
  },
});

const DisableSetextHeading: MarkdownConfig = {
  parseBlock: [
    {
      name: "SetextHeading",
      parse() {
        return false;
      },
    },
  ],
};

const HORIZONTAL_RULE_RE = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/u;
const LIST_PREFIX_RE = /^(\s*)([-*+]|\d+[.)]) (\[[ xX]\] )?/;
const DRAG_SCROLL_EDGE_SIZE = 48;
const DRAG_SCROLL_MAX_STEP = 24;
const TABLE_CELL_SELECTOR = ".cm-md-table-cell";
const TABLE_EDITOR_HOST_SELECTOR = ".cm-md-table-cell-editor";
const TABLE_WRAPPER_SELECTOR = ".cm-md-table-wrapper";
const TABLE_FROM_ATTR = "data-table-from";
const TABLE_TO_ATTR = "data-table-to";

function countSearchMatches(state: EditorState, query: SearchQuery): number {
  if (!query.valid) {
    return 0;
  }

  let count = 0;
  const cursor = query.getCursor(state);
  while (!cursor.next().done) {
    count++;
  }
  return count;
}

function findMatchAtIndex(
  state: EditorState,
  query: SearchQuery,
  index: number,
): { from: number; to: number } | null {
  if (!query.valid || index < 0) {
    return null;
  }

  let currentIndex = 0;
  const cursor = query.getCursor(state);
  for (;;) {
    const next = cursor.next();
    if (next.done) {
      break;
    }

    const match = next.value;
    if (currentIndex === index) {
      return match;
    }
    currentIndex++;
  }

  return null;
}

function lockScrollPosition(scrollContainer: HTMLElement, scrollTop: number) {
  scrollContainer.scrollTop = scrollTop;
  const lock = () => {
    scrollContainer.scrollTop = scrollTop;
  };
  scrollContainer.addEventListener("scroll", lock);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollContainer.removeEventListener("scroll", lock);
    });
  });
}

function getDragScrollDelta(
  scrollContainer: HTMLElement,
  clientY: number,
  ownerWindow: Window,
): number {
  const rect = scrollContainer.getBoundingClientRect();
  const viewportTop = ownerWindow.visualViewport?.offsetTop ?? 0;
  const viewportBottom =
    viewportTop +
    (ownerWindow.visualViewport?.height ?? ownerWindow.innerHeight);
  const effectiveTop = Math.max(rect.top, viewportTop);
  const effectiveBottom = Math.min(rect.bottom, viewportBottom);
  const effectiveHeight = effectiveBottom - effectiveTop;
  const zone = Math.min(DRAG_SCROLL_EDGE_SIZE, effectiveHeight / 4);
  if (zone <= 0) {
    return 0;
  }

  const topThreshold = effectiveTop + zone;
  if (clientY < topThreshold) {
    const intensity = (topThreshold - clientY) / zone;
    return -Math.max(1, Math.ceil(intensity * DRAG_SCROLL_MAX_STEP));
  }

  const bottomThreshold = effectiveBottom - zone;
  if (clientY > bottomThreshold) {
    const intensity = (clientY - bottomThreshold) / zone;
    return Math.max(1, Math.ceil(intensity * DRAG_SCROLL_MAX_STEP));
  }

  return 0;
}

function getListTextStartOffset(lineText: string): number {
  const match = LIST_PREFIX_RE.exec(lineText);
  return match ? match[0].length : 0;
}

function getListMarkerStartOffset(lineText: string): number {
  const match = LIST_PREFIX_RE.exec(lineText);
  return match ? (match[1]?.length ?? 0) : 0;
}

function getHorizontalRuleSelection(
  view: EditorView,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
) {
  const targetElement =
    target instanceof HTMLElement
      ? target
      : document.elementFromPoint(clientX, clientY);
  const lineElement = targetElement?.closest(".cm-line");

  if (
    !(lineElement instanceof HTMLElement) ||
    !view.contentDOM.contains(lineElement)
  ) {
    return null;
  }

  const hrElement = lineElement.querySelector(".cm-md-hr");
  if (!(hrElement instanceof HTMLElement)) {
    return null;
  }

  const lineStart = view.posAtDOM(lineElement, 0);
  const line = view.state.doc.lineAt(lineStart);
  if (!HORIZONTAL_RULE_RE.test(line.text)) {
    return null;
  }

  const cursor = EditorSelection.cursor(line.to, -1);

  return EditorSelection.create([cursor]);
}

function getTargetElementAtPoint(
  target: EventTarget | null,
  clientX: number,
  clientY: number,
) {
  return target instanceof HTMLElement
    ? target
    : document.elementFromPoint(clientX, clientY);
}

function isInteractiveTableTarget(targetElement: HTMLElement | Element | null) {
  return Boolean(
    targetElement?.closest(
      `${TABLE_CELL_SELECTOR}, ${TABLE_EDITOR_HOST_SELECTOR}`,
    ),
  );
}

function findTableWrapperAtY(view: EditorView, clientY: number) {
  for (const candidate of view.contentDOM.querySelectorAll(
    TABLE_WRAPPER_SELECTOR,
  )) {
    if (!(candidate instanceof HTMLElement)) {
      continue;
    }

    const rect = candidate.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      return candidate;
    }
  }

  return null;
}

function getTableSelectionSide(wrapperRect: DOMRect, clientX: number) {
  if (clientX <= wrapperRect.left) {
    return "before";
  }

  if (clientX >= wrapperRect.right) {
    return "after";
  }

  return clientX <= wrapperRect.left + wrapperRect.width / 2
    ? "before"
    : "after";
}

function getTableBoundarySelectionFromWrapper(
  wrapper: HTMLElement,
  selectionSide: "after" | "before",
) {
  const tableFrom = Number.parseInt(
    wrapper.getAttribute(TABLE_FROM_ATTR) ?? "",
    10,
  );
  const tableTo = Number.parseInt(
    wrapper.getAttribute(TABLE_TO_ATTR) ?? "",
    10,
  );
  if (!Number.isFinite(tableFrom) || !Number.isFinite(tableTo)) {
    return null;
  }

  return EditorSelection.create([
    EditorSelection.cursor(
      selectionSide === "before" ? tableFrom : tableTo,
      selectionSide === "before" ? 1 : -1,
    ),
  ]);
}

function getTableBoundarySelection(
  view: EditorView,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
  allowInteractiveTableTarget = false,
) {
  const targetElement = getTargetElementAtPoint(target, clientX, clientY);
  if (!allowInteractiveTableTarget && isInteractiveTableTarget(targetElement)) {
    return null;
  }

  const wrapperFromTarget = targetElement?.closest(TABLE_WRAPPER_SELECTOR);
  let wrapper =
    wrapperFromTarget instanceof HTMLElement &&
    view.contentDOM.contains(wrapperFromTarget)
      ? wrapperFromTarget
      : null;

  if (!wrapper) {
    wrapper = findTableWrapperAtY(view, clientY);
  }

  if (!wrapper) {
    return null;
  }

  const wrapperRect = wrapper.getBoundingClientRect();
  const selectionSide = getTableSelectionSide(wrapperRect, clientX);

  return getTableBoundarySelectionFromWrapper(wrapper, selectionSide);
}

function getGutterTableBoundarySelection(
  view: EditorView,
  clientY: number,
  side: GutterSide,
) {
  const wrapper = findTableWrapperAtY(view, clientY);
  if (!wrapper) {
    return null;
  }

  return getTableBoundarySelectionFromWrapper(
    wrapper,
    side === "left" ? "before" : "after",
  );
}

function getLineBoundaryCursor(
  view: EditorView,
  clientY: number,
  side: GutterSide,
) {
  const contentRect = view.contentDOM.getBoundingClientRect();
  const targetY = Math.min(
    contentRect.bottom - 1,
    Math.max(contentRect.top + 1, clientY),
  );
  const tableBoundarySelection = getGutterTableBoundarySelection(
    view,
    targetY,
    side,
  );
  if (tableBoundarySelection) {
    return tableBoundarySelection.main;
  }

  const probeInset = Math.max(view.defaultCharacterWidth * 4, 8);
  const probeX =
    side === "left"
      ? Math.min(contentRect.left + probeInset, contentRect.right - 1)
      : Math.max(contentRect.right - probeInset, contentRect.left + 1);
  const anchor = view.posAndSideAtCoords({ x: probeX, y: targetY }, false);

  if (anchor == null) {
    return null;
  }

  const line = view.state.doc.lineAt(anchor.pos);
  if (side === "left") {
    return EditorSelection.cursor(
      line.from + getListMarkerStartOffset(line.text),
      1,
    );
  }

  const contentFrom = Math.min(
    line.to,
    line.from + getListTextStartOffset(line.text),
  );

  return findVisualFragmentBoundary(view, contentFrom, line.to, targetY, side);
}

function getSelectionHeadFromPoint(
  view: EditorView,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
  side: GutterSide,
) {
  const contentRect = view.contentDOM.getBoundingClientRect();
  const clampedY = Math.min(
    contentRect.bottom - 1,
    Math.max(contentRect.top + 1, clientY),
  );

  if (clientX <= contentRect.left || clientX >= contentRect.right) {
    return getLineBoundaryCursor(view, clampedY, side);
  }

  const tableBoundarySelection = getTableBoundarySelection(
    view,
    target,
    clientX,
    clampedY,
    true,
  );
  if (tableBoundarySelection) {
    return tableBoundarySelection.main;
  }

  const pos = view.posAtCoords(
    {
      x: clientX,
      y: clampedY,
    },
    false,
  );
  if (pos == null) {
    return null;
  }

  return EditorSelection.cursor(pos);
}

function getContentSelectionHeadFromPoint(
  view: EditorView,
  target: EventTarget | null,
  clientX: number,
  clientY: number,
) {
  const contentRect = view.contentDOM.getBoundingClientRect();
  const clampedX = Math.min(
    contentRect.right - 1,
    Math.max(contentRect.left + 1, clientX),
  );
  const clampedY = Math.min(
    contentRect.bottom - 1,
    Math.max(contentRect.top + 1, clientY),
  );

  const tableBoundarySelection = getTableBoundarySelection(
    view,
    target,
    clampedX,
    clampedY,
    true,
  );
  if (tableBoundarySelection) {
    return tableBoundarySelection.main;
  }

  const pos = view.posAtCoords({ x: clampedX, y: clampedY }, false);
  if (pos != null) {
    return EditorSelection.cursor(pos);
  }

  const boundaryLine =
    clientY < contentRect.top
      ? view.state.doc.line(1)
      : view.state.doc.line(view.state.doc.lines);
  return EditorSelection.cursor(
    clientY < contentRect.top ? boundaryLine.from : boundaryLine.to,
    clientY < contentRect.top ? 1 : -1,
  );
}

function startSelectionEdgeAutoScroll(
  view: EditorView,
  pointerId: number,
  options: {
    captureOnStart?: boolean;
    getAnchor(): number;
    getHead(pointer: DragPointerState): SelectionRange | null;
    updateSelectionOnPointerMove?: boolean;
  },
) {
  const pointerTarget = view.contentDOM;
  const ownerWindow = pointerTarget.ownerDocument.defaultView ?? window;
  const scrollContainer = getEditorScrollContainer(view);
  let animationFrame: number | null = null;
  let hasCapture = false;
  let latestPointer: DragPointerState | null = null;

  const capturePointer = () => {
    if (hasCapture) {
      return;
    }

    pointerTarget.setPointerCapture(pointerId);
    hasCapture = true;
  };

  const stopAnimation = () => {
    if (animationFrame == null) {
      return;
    }

    ownerWindow.cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  const updateSelection = (pointer: DragPointerState) => {
    const head = options.getHead(pointer);
    if (!head) {
      return;
    }

    view.dispatch({
      scrollIntoView: false,
      selection: EditorSelection.create([
        EditorSelection.range(options.getAnchor(), head.head),
      ]),
    });
  };

  const tick = () => {
    animationFrame = null;
    if (!latestPointer) {
      return;
    }

    const delta = getDragScrollDelta(
      scrollContainer,
      latestPointer.clientY,
      ownerWindow,
    );
    if (delta === 0) {
      return;
    }

    const maxScrollTop = Math.max(
      0,
      scrollContainer.scrollHeight - scrollContainer.clientHeight,
    );
    const nextScrollTop = Math.max(
      0,
      Math.min(maxScrollTop, scrollContainer.scrollTop + delta),
    );

    if (nextScrollTop !== scrollContainer.scrollTop) {
      scrollContainer.scrollTop = nextScrollTop;
      view.requestMeasure();
    }

    updateSelection(latestPointer);
    animationFrame = ownerWindow.requestAnimationFrame(tick);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) {
      return;
    }

    if ((event.buttons & 1) === 0) {
      cleanup();
      return;
    }

    latestPointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target,
    };

    const delta = getDragScrollDelta(
      scrollContainer,
      event.clientY,
      ownerWindow,
    );

    if (delta !== 0 && !hasCapture) {
      capturePointer();
    }

    if (options.updateSelectionOnPointerMove || hasCapture) {
      updateSelection(latestPointer);
    }

    if (delta === 0) {
      stopAnimation();
      return;
    }

    event.preventDefault();
    if (animationFrame == null) {
      animationFrame = ownerWindow.requestAnimationFrame(tick);
    }
  };

  const handlePointerDone = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) {
      return;
    }

    cleanup();
  };

  const cleanup = () => {
    stopAnimation();
    pointerTarget.removeEventListener("pointermove", handlePointerMove, true);
    pointerTarget.removeEventListener("pointerup", handlePointerDone, true);
    pointerTarget.removeEventListener("pointercancel", handlePointerDone, true);
    pointerTarget.removeEventListener(
      "lostpointercapture",
      handlePointerDone,
      true,
    );
    if (hasCapture && pointerTarget.hasPointerCapture(pointerId)) {
      pointerTarget.releasePointerCapture(pointerId);
    }
  };

  pointerTarget.addEventListener("pointermove", handlePointerMove, true);
  pointerTarget.addEventListener("pointerup", handlePointerDone, true);
  pointerTarget.addEventListener("pointercancel", handlePointerDone, true);
  pointerTarget.addEventListener("lostpointercapture", handlePointerDone, true);
  if (options.captureOnStart) {
    capturePointer();
  }

  return cleanup;
}

function isRectOnClickedRow(
  rect: { top: number; bottom: number },
  clientY: number,
): boolean {
  return clientY >= rect.top && clientY <= rect.bottom;
}

function findVisualFragmentBoundary(
  view: EditorView,
  lineFrom: number,
  lineTo: number,
  clientY: number,
  side: "left" | "right",
) {
  if (side === "left") {
    for (let position = lineFrom; position <= lineTo; position += 1) {
      const rect =
        view.coordsAtPos(position, 1) ?? view.coordsAtPos(position, -1);
      if (rect && isRectOnClickedRow(rect, clientY)) {
        return EditorSelection.cursor(position, 1);
      }
    }
    return EditorSelection.cursor(lineFrom, 1);
  }

  for (let position = lineTo; position >= lineFrom; position -= 1) {
    const rect =
      view.coordsAtPos(position, -1) ?? view.coordsAtPos(position, 1);
    if (rect && isRectOnClickedRow(rect, clientY)) {
      return EditorSelection.cursor(position, -1);
    }
  }

  return EditorSelection.cursor(lineTo, -1);
}

function blurEditorView(view: EditorView) {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    view.dom.contains(activeElement)
  ) {
    activeElement.blur();
  }

  view.contentDOM.blur();
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  function NoteEditor(
    {
      autoFocus = false,
      loadKey,
      markdown,
      onChange,
      onAutoFocusHandled,
      onEditorFocusChange,
      onSearchMatchCountChange,
      readOnly,
      searchHighlightAllMatchesYellow,
      searchActiveMatchIndex,
      searchQuery,
      searchScrollRevision,
      spellCheck = false,
      toolbarContainer = null,
      vimMode = false,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onEditorFocusChangeRef = useRef(onEditorFocusChange);
    const onSearchMatchCountChangeRef = useRef(onSearchMatchCountChange);
    const editableCompartmentRef = useRef<Compartment | null>(null);
    const contentAttributesCompartmentRef = useRef<Compartment | null>(null);
    const presentationCompartmentRef = useRef<Compartment | null>(null);
    const vimCompartmentRef = useRef<Compartment | null>(null);
    const applyingExternalChangeRef = useRef(false);
    const lastLoadKeyRef = useRef(loadKey);
    const prevPaneRef = useRef(useShellStore.getState().focusedPane);
    const previousActiveFindRef = useRef(
      searchQuery.trim().length > 0 && searchActiveMatchIndex != null,
    );
    const restoreSelectionRef = useRef<SelectionRange | null>(null);
    const gutterDragCleanupRef = useRef<(() => void) | null>(null);
    const gutterPointerIdRef = useRef<number | null>(null);
    const selectionAutoScrollCleanupRef = useRef<(() => void) | null>(null);
    const initialMarkdownRef = useRef(markdown);
    const initialReadOnlyRef = useRef(readOnly);
    const initialSearchQueryRef = useRef(searchQuery);
    const initialSpellCheckRef = useRef(spellCheck);
    const initialVimModeRef = useRef(vimMode);
    const selectAllCursorRef = useRef<number | null>(null);
    const [toolbarState, setToolbarState] = useState(DEFAULT_TOOLBAR_STATE);

    if (editableCompartmentRef.current === null) {
      editableCompartmentRef.current = new Compartment();
    }
    if (contentAttributesCompartmentRef.current === null) {
      contentAttributesCompartmentRef.current = new Compartment();
    }
    if (presentationCompartmentRef.current === null) {
      presentationCompartmentRef.current = new Compartment();
    }
    if (vimCompartmentRef.current === null) {
      vimCompartmentRef.current = new Compartment();
    }

    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
      onEditorFocusChangeRef.current = onEditorFocusChange;
    }, [onEditorFocusChange]);

    useEffect(() => {
      onSearchMatchCountChangeRef.current = onSearchMatchCountChange;
    }, [onSearchMatchCountChange]);

    const applyToolbarMutation = useCallback(
      (
        transform: (
          markdown: string,
          selection: SelectionSnapshot,
        ) => {
          markdown: string;
          selection: SelectionSnapshot;
        },
      ) => {
        const view = viewRef.current;
        if (!view || readOnly) {
          return false;
        }

        const currentMarkdown = view.state.doc.toString();
        const currentSelection = view.state.selection.main;
        const next = transform(currentMarkdown, {
          anchor: currentSelection.anchor,
          head: currentSelection.head,
        });

        if (
          next.markdown === currentMarkdown &&
          next.selection.anchor === currentSelection.anchor &&
          next.selection.head === currentSelection.head
        ) {
          view.focus();
          return false;
        }

        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: next.markdown,
          },
          selection: EditorSelection.range(
            next.selection.anchor,
            next.selection.head,
          ),
        });
        view.focus();
        return true;
      },
      [readOnly],
    );

    const handleToggleInlineFormat = useCallback(
      (format: InlineFormat) => {
        applyToolbarMutation((currentMarkdown, selection) =>
          toggleInlineFormat(currentMarkdown, selection, format),
        );
      },
      [applyToolbarMutation],
    );

    const handleCycleBlockType = useCallback(() => {
      applyToolbarMutation(cycleBlockType);
    }, [applyToolbarMutation]);

    const handleInsertCodeBlock = useCallback(() => {
      applyToolbarMutation(insertCodeBlock);
    }, [applyToolbarMutation]);

    const handleInsertTable = useCallback(() => {
      applyToolbarMutation(insertMarkdownTable);
    }, [applyToolbarMutation]);

    const handleInsertImage = useCallback(async () => {
      if (readOnly) {
        return;
      }

      const sourcePath = await openFileDialog({
        filters: [
          {
            extensions: IMAGE_EXTENSIONS,
            name: "Images",
          },
        ],
        multiple: false,
      });

      if (typeof sourcePath !== "string") {
        return;
      }

      const imported = await importImage(sourcePath);
      const src = unresolveImageSrc(imported.assetUrl);
      applyToolbarMutation((currentMarkdown, selection) =>
        insertMarkdownImage(currentMarkdown, selection, {
          altText: imported.altText,
          src,
        }),
      );
    }, [applyToolbarMutation, readOnly]);

    useEffect(() => {
      if (!containerRef.current) {
        return;
      }

      const editableExtension = editableCompartmentRef.current!.of([
        EditorState.readOnly.of(initialReadOnlyRef.current),
        EditorView.editable.of(!initialReadOnlyRef.current),
      ]);
      const contentAttributesExtension =
        contentAttributesCompartmentRef.current!.of(
          EditorView.contentAttributes.of({
            autocapitalize: "off",
            autocorrect: "off",
            class: "comet-editor-content",
            spellcheck: initialSpellCheckRef.current ? "true" : "false",
          }),
        );
      const presentationExtension = presentationCompartmentRef.current!.of(
        buildSearchAwarePresentationExtensions(initialSearchQueryRef.current),
      );

      const view = new EditorView({
        doc: initialMarkdownRef.current,
        extensions: [
          MARKDOWN_EDITOR_THEME,
          syntaxHighlighting(MARKDOWN_HIGHLIGHT_STYLE),
          history(),
          highlightSpecialChars(),
          drawSelection(),
          EditorView.lineWrapping,
          scrollCenterOnEnter({ viewportPercentage: 5 }),
          markdownLanguage({
            base: markdownLang,
            extensions: [
              Strikethrough,
              Table,
              TaskList,
              HighlightSyntax,
              TagGrammar,
              DisableSetextHeading,
            ],
            codeLanguages: languages,
          }),
          presentationExtension,
          tagHighlightStyle,
          search(),
          EditorView.domEventHandlers({
            pointerdown(event, view) {
              selectionAutoScrollCleanupRef.current?.();
              selectionAutoScrollCleanupRef.current = null;

              if (
                event.button !== 0 ||
                !event.isPrimary ||
                (event.target instanceof HTMLElement &&
                  event.target.closest(
                    `${TABLE_CELL_SELECTOR}, ${TABLE_EDITOR_HOST_SELECTOR}, .cm-md-task-marker-source`,
                  ))
              ) {
                return;
              }

              let anchor: number | null = null;
              selectionAutoScrollCleanupRef.current =
                startSelectionEdgeAutoScroll(view, event.pointerId, {
                  captureOnStart: false,
                  getAnchor: () => anchor ?? view.state.selection.main.anchor,
                  getHead: (pointer) =>
                    getContentSelectionHeadFromPoint(
                      view,
                      pointer.target,
                      pointer.clientX,
                      pointer.clientY,
                    ),
                });

              requestAnimationFrame(() => {
                anchor = view.state.selection.main.anchor;
              });
            },
            mousedown(event, view) {
              if (!view.hasFocus) {
                useShellStore.getState().setFocusedPane("editor");
                view.contentDOM.focus({ preventScroll: true });
              }

              const horizontalRuleSelection = getHorizontalRuleSelection(
                view,
                event.target,
                event.clientX,
                event.clientY,
              );
              if (horizontalRuleSelection) {
                selectionAutoScrollCleanupRef.current?.();
                selectionAutoScrollCleanupRef.current = null;
                event.preventDefault();
                event.stopPropagation();
                view.focus();
                view.dispatch({ selection: horizontalRuleSelection });
                return true;
              }

              const tableBoundarySelection = getTableBoundarySelection(
                view,
                event.target,
                event.clientX,
                event.clientY,
              );
              if (tableBoundarySelection) {
                selectionAutoScrollCleanupRef.current?.();
                selectionAutoScrollCleanupRef.current = null;
                event.preventDefault();
                event.stopPropagation();
                view.focus();
                view.dispatch({
                  scrollIntoView: false,
                  selection: tableBoundarySelection,
                });
                return true;
              }

              event.stopPropagation();

              if (!view.hasFocus) {
                event.preventDefault();

                const scrollContainer = view.dom.closest(
                  "[data-editor-scroll-container]",
                ) as HTMLElement | null;
                const scrollTop = scrollContainer?.scrollTop ?? 0;
                const clickedInsideTable =
                  event.target instanceof HTMLElement &&
                  event.target.closest(".cm-md-table-wrapper");

                view.focus();

                if (scrollContainer) {
                  lockScrollPosition(scrollContainer, scrollTop);
                }

                if (clickedInsideTable) {
                  return false;
                }

                const pos = view.posAtCoords(
                  {
                    x: event.clientX,
                    y: event.clientY,
                  },
                  false,
                );
                if (pos != null) {
                  view.dispatch({
                    selection: EditorSelection.cursor(pos),
                    scrollIntoView: false,
                  });
                }

                return true;
              }

              return false;
            },
          }),
          EditorView.domEventHandlers({
            keydown(event, view) {
              if (event.defaultPrevented) {
                return false;
              }

              if (isNotesSearchShortcut(event)) {
                return false;
              }

              if (isEditorFindShortcut(event)) {
                return true;
              }
              if (event.ctrlKey && !event.metaKey && event.key === "k") {
                event.preventDefault();
                const el = getEditorScrollContainer(view);
                const pageHeight = el.clientHeight;
                el.scrollBy({ top: -pageHeight, behavior: "smooth" });
                const targetTop = Math.max(0, el.scrollTop - pageHeight);
                const pos = view.lineBlockAtHeight(
                  targetTop - view.documentTop,
                ).from;
                view.dispatch({ selection: EditorSelection.cursor(pos) });
                return true;
              }
              return false;
            },
          }),
          keymap.of([
            {
              key: "Escape",
              run(view) {
                const { main } = view.state.selection;
                const savedCursor = selectAllCursorRef.current;
                const isFullDocumentSelection =
                  !main.empty &&
                  main.from === 0 &&
                  main.to === view.state.doc.length;

                if (!isFullDocumentSelection || savedCursor == null) {
                  return false;
                }

                selectAllCursorRef.current = null;
                view.dispatch({
                  selection: EditorSelection.cursor(
                    Math.min(savedCursor, view.state.doc.length),
                  ),
                });
                return true;
              },
            },
            {
              key: "Mod-a",
              run(view) {
                selectAllCursorRef.current = view.state.selection.main.head;
                return selectAll(view);
              },
            },
            ...markdownKeymap,
            ...defaultKeymap.filter(
              (b) => b.key !== "Ctrl-k" && b.mac !== "Ctrl-k",
            ),
            ...historyKeymap,
          ]),
          vimCompartmentRef.current!.of(initialVimModeRef.current ? vim() : []),
          editableExtension,
          contentAttributesExtension,
          EditorView.updateListener.of((update) => {
            if (
              update.viewportChanged ||
              update.docChanged ||
              update.selectionSet
            ) {
              const scrollContainer = getEditorScrollContainer(update.view);
              logEditorDebug("editor-update", "editor view update", {
                docChanged: update.docChanged,
                docLength: update.state.doc.length,
                docLines: update.state.doc.lines,
                scrollTop: scrollContainer.scrollTop,
                selection: {
                  anchor: update.state.selection.main.anchor,
                  empty: update.state.selection.main.empty,
                  head: update.state.selection.main.head,
                },
                selectionSet: update.selectionSet,
                visibleRanges: summarizeRanges(update.view.visibleRanges),
                viewport: `${update.view.viewport.from}-${update.view.viewport.to}`,
                viewportChanged: update.viewportChanged,
              });
            }

            if (update.docChanged && !applyingExternalChangeRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }

            if (
              !update.docChanged &&
              update.selectionSet &&
              update.state.selection.main.empty
            ) {
              selectAllCursorRef.current = null;
            }

            if (update.docChanged) {
              const query = getSearchQuery(update.state);
              onSearchMatchCountChangeRef.current?.(
                countSearchMatches(update.state, query),
              );
            }

            if (update.docChanged || update.selectionSet) {
              setToolbarState(
                getToolbarState(update.state.doc.toString(), {
                  anchor: update.state.selection.main.anchor,
                  head: update.state.selection.main.head,
                }),
              );
            }
          }),
          EditorView.domEventHandlers({
            focus: () => {
              onEditorFocusChangeRef.current?.(true);
            },
            blur: (event) => {
              const nextTarget = event.relatedTarget;
              if (
                nextTarget instanceof Node &&
                containerRef.current?.contains(nextTarget)
              ) {
                return;
              }

              onEditorFocusChangeRef.current?.(false);
            },
          }),
        ],
        parent: containerRef.current,
      });

      viewRef.current = view;
      onSearchMatchCountChangeRef.current?.(0);
      setToolbarState(
        getToolbarState(view.state.doc.toString(), {
          anchor: view.state.selection.main.anchor,
          head: view.state.selection.main.head,
        }),
      );

      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      view.dispatch({
        effects: [
          editableCompartmentRef.current!.reconfigure([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          contentAttributesCompartmentRef.current!.reconfigure(
            EditorView.contentAttributes.of({
              autocapitalize: "off",
              autocorrect: "off",
              class: "comet-editor-content",
              spellcheck: spellCheck ? "true" : "false",
            }),
          ),
        ],
      });
    }, [readOnly, spellCheck]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || !vimCompartmentRef.current) {
        return;
      }
      view.dispatch({
        effects: vimCompartmentRef.current.reconfigure(vimMode ? vim() : []),
      });
    }, [vimMode]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || !presentationCompartmentRef.current) {
        return;
      }

      view.dispatch({
        effects: presentationCompartmentRef.current.reconfigure(
          buildSearchAwarePresentationExtensions(searchQuery),
        ),
      });
    }, [searchQuery]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      const isActiveFind =
        searchQuery.trim().length > 0 && searchActiveMatchIndex != null;

      if (
        !previousActiveFindRef.current &&
        isActiveFind &&
        restoreSelectionRef.current == null
      ) {
        restoreSelectionRef.current = view.state.selection.main;
      } else if (previousActiveFindRef.current && !isActiveFind) {
        const restoreSelection = restoreSelectionRef.current;
        restoreSelectionRef.current = null;

        if (restoreSelection) {
          view.dispatch({
            selection: EditorSelection.range(
              restoreSelection.anchor,
              restoreSelection.head,
            ),
          });
        } else {
          const cursor = view.state.selection.main.head;
          view.dispatch({
            selection: EditorSelection.cursor(cursor),
          });
        }
      }

      previousActiveFindRef.current = isActiveFind;
    }, [searchActiveMatchIndex, searchQuery]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      const currentQuery = getSearchQuery(view.state);
      if (currentQuery.search === searchQuery) {
        return;
      }

      const activeElement = document.activeElement;
      if (searchQuery && !searchPanelOpen(view.state)) {
        openSearchPanel(view);
        if (activeElement instanceof HTMLElement) {
          activeElement.focus();
        }
      } else if (!searchQuery && searchPanelOpen(view.state)) {
        closeSearchPanel(view);
      }

      view.dispatch({
        effects: setSearchQuery.of(
          new SearchQuery({ search: searchQuery, literal: true }),
        ),
      });

      const query = getSearchQuery(view.state);
      onSearchMatchCountChangeRef.current?.(
        countSearchMatches(view.state, query),
      );
    }, [searchQuery]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      const nextMarkdown = markdown;
      const currentMarkdown = view.state.doc.toString();
      const isNewLoad = lastLoadKeyRef.current !== loadKey;
      if (!isNewLoad && currentMarkdown === nextMarkdown) {
        return;
      }

      applyingExternalChangeRef.current = true;

      if (isNewLoad) {
        // Replace content and exclude from undo history so the user
        // cannot undo past the newly loaded note.
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: nextMarkdown,
          },
          annotations: Transaction.addToHistory.of(false),
        });

        if (autoFocus) {
          view.dispatch({
            selection: EditorSelection.cursor(view.state.doc.length),
          });
          view.focus();
          onAutoFocusHandled?.();
        } else {
          blurEditorView(view);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (useShellStore.getState().focusedPane !== "editor") {
                blurEditorView(view);
              }
            });
          });
        }
      } else {
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: nextMarkdown,
          },
          selection: EditorSelection.cursor(
            Math.min(view.state.selection.main.head, nextMarkdown.length),
          ),
        });
      }

      applyingExternalChangeRef.current = false;
      lastLoadKeyRef.current = loadKey;
    }, [autoFocus, loadKey, markdown, onAutoFocusHandled]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view || !searchHighlightAllMatchesYellow || !searchQuery) {
        return;
      }

      const frame = requestAnimationFrame(() => {
        const [firstMatch] = collectSearchMatches(
          view.state.doc.toString(),
          searchQuery,
        );
        if (!firstMatch) {
          return;
        }

        revealEditorPositionIfNeeded(view, firstMatch.from);
      });

      return () => cancelAnimationFrame(frame);
    }, [loadKey, markdown, searchHighlightAllMatchesYellow, searchQuery]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) {
        return;
      }

      if (searchActiveMatchIndex == null || !searchQuery) {
        return;
      }

      const query = getSearchQuery(view.state);
      const match = findMatchAtIndex(view.state, query, searchActiveMatchIndex);
      if (match) {
        view.dispatch({
          selection: EditorSelection.range(match.from, match.to),
        });
        centerEditorPositionInView(view, match.from);
      }
    }, [searchActiveMatchIndex, searchQuery, searchScrollRevision]);

    useImperativeHandle(
      ref,
      () => ({
        blur() {
          viewRef.current?.contentDOM.blur();
        },
        focus() {
          if (readOnly) {
            return;
          }
          viewRef.current?.focus();
        },
        redo() {
          return viewRef.current ? redo(viewRef.current) : false;
        },
        undo() {
          return viewRef.current ? undo(viewRef.current) : false;
        },
      }),
      [readOnly],
    );

    useEffect(() => {
      return useShellStore.subscribe((state) => {
        const previousPane = prevPaneRef.current;
        prevPaneRef.current = state.focusedPane;
        if (previousPane === "editor" && state.focusedPane !== "editor") {
          viewRef.current?.contentDOM.blur();
        }
      });
    }, []);

    useEffect(() => {
      return () => {
        gutterDragCleanupRef.current?.();
        gutterDragCleanupRef.current = null;
        selectionAutoScrollCleanupRef.current?.();
        selectionAutoScrollCleanupRef.current = null;
      };
    }, []);

    const startGutterSelectionDrag = (
      event: MouseEvent<HTMLDivElement>,
      side: GutterSide,
    ) => {
      if (readOnly) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      useShellStore.getState().setFocusedPane("editor");

      const view = viewRef.current;
      if (!view) {
        return;
      }

      const anchor = getLineBoundaryCursor(view, event.clientY, side);
      if (!anchor) {
        return;
      }

      const scrollContainer = view.dom.closest(
        "[data-editor-scroll-container]",
      ) as HTMLElement | null;
      const scrollTop = scrollContainer?.scrollTop ?? 0;

      view.focus();
      if (scrollContainer) {
        lockScrollPosition(scrollContainer, scrollTop);
      }

      view.dispatch({
        selection: EditorSelection.create([anchor]),
      });

      gutterDragCleanupRef.current?.();
      selectionAutoScrollCleanupRef.current?.();
      const pointerId = gutterPointerIdRef.current;
      selectionAutoScrollCleanupRef.current = startSelectionEdgeAutoScroll(
        view,
        pointerId ?? 1,
        {
          captureOnStart: true,
          getAnchor: () => anchor.anchor,
          getHead: (pointer) =>
            getSelectionHeadFromPoint(
              view,
              pointer.target,
              pointer.clientX,
              pointer.clientY,
              side,
            ),
          updateSelectionOnPointerMove: true,
        },
      );

      const cleanup = () => {
        selectionAutoScrollCleanupRef.current?.();
        selectionAutoScrollCleanupRef.current = null;
        gutterPointerIdRef.current = null;
        if (gutterDragCleanupRef.current === cleanup) {
          gutterDragCleanupRef.current = null;
        }
      };

      gutterDragCleanupRef.current = cleanup;
    };

    return (
      <>
        <div
          className={cn(
            "comet-editor-shell relative flex min-h-full w-full flex-1",
            searchHighlightAllMatchesYellow &&
              "comet-codemirror-passive-search",
            searchQuery &&
              !searchHighlightAllMatchesYellow &&
              "comet-codemirror-active-search",
          )}
        >
          <div
            className="comet-editor-gutter"
            data-editor-gutter="left"
            onPointerDown={(event) => {
              gutterPointerIdRef.current = event.pointerId;
            }}
            onClick={(event: MouseEvent<HTMLDivElement>) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseUp={(event: MouseEvent<HTMLDivElement>) => {
              event.preventDefault();
              event.stopPropagation();
              viewRef.current?.focus();
            }}
            onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
              startGutterSelectionDrag(event, "left");
            }}
          />
          <div className="comet-editor-column">
            <div
              className="comet-codemirror-host min-h-full flex-1"
              ref={containerRef}
            />
          </div>
          <div
            className="comet-editor-gutter"
            data-editor-gutter="right"
            onPointerDown={(event) => {
              gutterPointerIdRef.current = event.pointerId;
            }}
            onClick={(event: MouseEvent<HTMLDivElement>) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseUp={(event: MouseEvent<HTMLDivElement>) => {
              event.preventDefault();
              event.stopPropagation();
              viewRef.current?.focus();
            }}
            onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
              startGutterSelectionDrag(event, "right");
            }}
          />
        </div>
        {toolbarContainer && !readOnly
          ? createPortal(
              <EditorToolbar
                state={toolbarState}
                onCycleBlockType={handleCycleBlockType}
                onInsertCodeBlock={handleInsertCodeBlock}
                onInsertImage={() => void handleInsertImage()}
                onInsertTable={handleInsertTable}
                onToggleInlineFormat={handleToggleInlineFormat}
              />,
              toolbarContainer,
            )
          : null}
      </>
    );
  },
);
