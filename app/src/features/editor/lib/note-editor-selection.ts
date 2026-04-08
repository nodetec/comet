import { EditorSelection, type SelectionRange } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import {
  getEditorScrollContainer,
  holdEditorScrollPosition,
} from "@/features/editor/lib/view-utils";

export type GutterSide = "left" | "right";

export type DragPointerState = {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
};

const HORIZONTAL_RULE_RE = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/u;
const LIST_PREFIX_RE = /^(\s*)([-*+]|\d+[.)]) (\[[ xX]\] )?/;
const DRAG_MIN_DISTANCE = 5;
const DRAG_SCROLL_EDGE_SIZE = 48;
const DRAG_SCROLL_MAX_STEP = 24;

export const TABLE_CELL_SELECTOR = ".cm-md-table-cell";
export const TABLE_EDITOR_HOST_SELECTOR = ".cm-md-table-cell-editor";

const TABLE_WRAPPER_SELECTOR = ".cm-md-table-wrapper";
const TABLE_FROM_ATTR = "data-table-from";
const TABLE_TO_ATTR = "data-table-to";

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

export function getHorizontalRuleSelection(
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

export function getTableBoundarySelection(
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

function getDocumentBoundaryCursorForVerticalOverflow(
  view: EditorView,
  clientY: number,
) {
  const startRect = view.coordsAtPos(0, 1) ?? view.coordsAtPos(0, -1);
  if (startRect && clientY < startRect.top) {
    return EditorSelection.cursor(0, 1);
  }

  const endPosition = view.state.doc.length;
  const endRect =
    view.coordsAtPos(endPosition, -1) ?? view.coordsAtPos(endPosition, 1);
  if (endRect && clientY > endRect.bottom) {
    return EditorSelection.cursor(endPosition, -1);
  }

  return null;
}

export function getLineBoundaryCursor(
  view: EditorView,
  clientY: number,
  side: GutterSide,
) {
  const documentLength = view.state.doc.length;
  const documentBoundaryCursor = getDocumentBoundaryCursorForVerticalOverflow(
    view,
    clientY,
  );
  if (documentBoundaryCursor) {
    return documentBoundaryCursor;
  }

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
    if (clientY <= contentRect.top) {
      return EditorSelection.cursor(0, 1);
    }

    if (clientY >= contentRect.bottom) {
      return EditorSelection.cursor(documentLength, -1);
    }

    return EditorSelection.cursor(documentLength, -1);
  }

  const line = view.state.doc.lineAt(anchor.pos);
  if (side === "left") {
    const contentFrom = line.from + getListMarkerStartOffset(line.text);
    return findVisualFragmentBoundary(
      view,
      contentFrom,
      line.to,
      targetY,
      side,
    );
  }

  const contentFrom = Math.min(
    line.to,
    line.from + getListTextStartOffset(line.text),
  );

  return findVisualFragmentBoundary(view, contentFrom, line.to, targetY, side);
}

export function getSelectionHeadFromPoint(
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

export function getContentSelectionHeadFromPoint(
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

export function startSelectionEdgeAutoScroll(
  view: EditorView,
  pointerId: number,
  options: {
    captureOnStart?: boolean;
    getAnchor(): number;
    getHead(pointer: DragPointerState): SelectionRange | null;
    requireChangedNonEmptySelectionBeforeActivation?: boolean;
    updateSelectionOnPointerMove?: boolean;
  },
) {
  const pointerTarget = view.contentDOM;
  const ownerWindow = pointerTarget.ownerDocument.defaultView ?? window;
  const scrollContainer = getEditorScrollContainer(view);
  const initialSelection = view.state.selection.main;
  let animationFrame: number | null = null;
  let hasCapture = false;
  let latestPointer: DragPointerState | null = null;
  let initialPointerY: number | null = null;
  let dragConfirmed = false;
  let releaseScrollHold: (() => void) | null =
    holdEditorScrollPosition(scrollContainer);

  const capturePointer = () => {
    if (hasCapture) {
      return;
    }

    pointerTarget.setPointerCapture(pointerId);
    pointerTarget.ownerDocument.body.style.cursor = "text";
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

    if (initialPointerY == null) {
      initialPointerY = event.clientY;
    }

    if (
      !dragConfirmed &&
      isWithinDragConfirmationThreshold(initialPointerY, event.clientY)
    ) {
      if (options.updateSelectionOnPointerMove) {
        updateSelection(latestPointer);
      }
      return;
    }

    if (!dragConfirmed) {
      dragConfirmed = true;
      releaseScrollHold?.();
      releaseScrollHold = null;
    }

    if (
      shouldWaitForSelectionActivation(
        view.state.selection.main,
        initialSelection,
        options.requireChangedNonEmptySelectionBeforeActivation,
      )
    ) {
      stopAnimation();
      return;
    }

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
    releaseScrollHold?.();
    releaseScrollHold = null;
    stopAnimation();
    pointerTarget.removeEventListener("pointermove", handlePointerMove, true);
    pointerTarget.removeEventListener("pointerup", handlePointerDone, true);
    pointerTarget.removeEventListener("pointercancel", handlePointerDone, true);
    pointerTarget.removeEventListener(
      "lostpointercapture",
      handlePointerDone,
      true,
    );
    if (hasCapture) {
      pointerTarget.ownerDocument.body.style.cursor = "";
      if (pointerTarget.hasPointerCapture(pointerId)) {
        pointerTarget.releasePointerCapture(pointerId);
      }
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
) {
  return clientY >= rect.top && clientY <= rect.bottom;
}

function hasChangedNonEmptySelection(
  currentSelection: SelectionRange,
  initialSelection: SelectionRange,
) {
  return (
    !currentSelection.empty &&
    (currentSelection.anchor !== initialSelection.anchor ||
      currentSelection.head !== initialSelection.head)
  );
}

function isWithinDragConfirmationThreshold(
  initialPointerY: number,
  clientY: number,
) {
  return Math.abs(clientY - initialPointerY) < DRAG_MIN_DISTANCE;
}

function shouldWaitForSelectionActivation(
  currentSelection: SelectionRange,
  initialSelection: SelectionRange,
  requireChangedNonEmptySelectionBeforeActivation: boolean | undefined,
) {
  return (
    requireChangedNonEmptySelectionBeforeActivation &&
    !hasChangedNonEmptySelection(currentSelection, initialSelection)
  );
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
