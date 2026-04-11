import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

const HORIZONTAL_RULE_RE = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/u;

export const TABLE_CELL_SELECTOR = ".cm-md-table-cell";
export const TABLE_EDITOR_HOST_SELECTOR = ".cm-md-table-cell-editor";

const TABLE_WRAPPER_SELECTOR = ".cm-md-table-wrapper";
const TABLE_FROM_ATTR = "data-table-from";
const TABLE_TO_ATTR = "data-table-to";

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
