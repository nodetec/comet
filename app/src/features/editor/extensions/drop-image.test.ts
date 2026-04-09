// @vitest-environment jsdom

import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getContentSelectionHeadFromPointMock,
  getCurrentWebviewMock,
  importImageBytesMock,
  importImageMock,
  unresolveImageSrcMock,
} = vi.hoisted(() => ({
  getContentSelectionHeadFromPointMock: vi.fn(),
  getCurrentWebviewMock: vi.fn(),
  importImageBytesMock: vi.fn(),
  importImageMock: vi.fn(),
  unresolveImageSrcMock: vi.fn((src: string) => src),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: getCurrentWebviewMock,
}));

vi.mock("@/features/editor/lib/note-editor-selection", () => ({
  getContentSelectionHeadFromPoint: getContentSelectionHeadFromPointMock,
}));

vi.mock("@/shared/lib/attachments", () => ({
  IMAGE_EXTENSIONS: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
  importImage: importImageMock,
  importImageBytes: importImageBytesMock,
  unresolveImageSrc: unresolveImageSrcMock,
}));

import {
  dropImage,
  getDropPositionFromWebviewPoint,
} from "@/features/editor/extensions/drop-image";

function setRect(element: HTMLElement, rect: DOMRectInit) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => DOMRect.fromRect(rect),
  });
}

afterEach(() => {
  getContentSelectionHeadFromPointMock.mockReset();
  getCurrentWebviewMock.mockReset();
  importImageBytesMock.mockReset();
  importImageMock.mockReset();
  unresolveImageSrcMock.mockClear();
  document.body.replaceChildren();
});

describe("drop image positioning", () => {
  it("maps Tauri physical coordinates to the editor selection inside the editor", () => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });

    const editorRoot = document.createElement("div");
    const hitTarget = document.createElement("div");
    const textNode = document.createTextNode("hello");
    hitTarget.append(textNode);
    editorRoot.append(hitTarget);
    document.body.append(editorRoot);
    setRect(editorRoot, { x: 0, y: 0, width: 320, height: 200 });
    setRect(hitTarget, { x: 60, y: 50, width: 160, height: 40 });

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => hitTarget),
    });
    const elementFromPointSpy = vi.mocked(document.elementFromPoint);
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: vi.fn(() => ({
        startContainer: textNode,
        startOffset: 2,
      })),
    });

    const posAtDOM = vi.fn(() => 42);

    const toLogical = vi.fn(() => ({ x: 120, y: 80 }));
    const pos = getDropPositionFromWebviewPoint(
      {
        contentDOM: editorRoot,
        dom: editorRoot,
        posAtDOM,
        posAtCoords: vi.fn(() => null),
      } as unknown as EditorView,
      { toLogical, x: 240, y: 160 },
    );

    expect(pos).toBe(42);
    expect(toLogical).toHaveBeenCalledWith(2);
    expect(posAtDOM).toHaveBeenCalledWith(textNode, 2);
    expect(elementFromPointSpy).not.toHaveBeenCalled();
    expect(getContentSelectionHeadFromPointMock).not.toHaveBeenCalled();
  });

  it("falls back to CodeMirror hit testing when the DOM caret only resolves to the editor root", () => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });

    const editorRoot = document.createElement("div");
    const hitTarget = document.createElement("div");
    editorRoot.append(hitTarget);
    document.body.append(editorRoot);
    setRect(editorRoot, { x: 0, y: 0, width: 320, height: 200 });

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => hitTarget),
    });
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: vi.fn(() => ({
        startContainer: editorRoot,
        startOffset: 0,
      })),
    });

    getContentSelectionHeadFromPointMock.mockReturnValue(
      EditorSelection.cursor(17),
    );
    const posAtCoords = vi.fn(() => null);

    const pos = getDropPositionFromWebviewPoint(
      {
        contentDOM: editorRoot,
        dom: editorRoot,
        posAtCoords,
      } as unknown as EditorView,
      { x: 240, y: 160 },
    );

    expect(pos).toBe(17);
    expect(getContentSelectionHeadFromPointMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentDOM: editorRoot,
        dom: editorRoot,
      }),
      hitTarget,
      120,
      80,
    );
    expect(posAtCoords).toHaveBeenCalledWith({ x: 120, y: 80 }, false);
  });

  it("ignores drag positions outside the editor root", () => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });

    const editorRoot = document.createElement("div");
    document.body.append(editorRoot);
    setRect(editorRoot, { x: 20, y: 20, width: 300, height: 180 });

    const pos = getDropPositionFromWebviewPoint(
      {
        contentDOM: editorRoot,
        dom: editorRoot,
        posAtCoords: vi.fn(() => null),
      } as unknown as EditorView,
      { x: 900, y: 120 },
    );

    expect(pos).toBeNull();
    expect(getContentSelectionHeadFromPointMock).not.toHaveBeenCalled();
  });

  it("focuses the editor on the first native image drag so the drop cursor can render", async () => {
    type DragDropHandler = (event: {
      payload: {
        paths: string[];
        position: { x: number; y: number };
        type: string;
      };
    }) => void;

    let dragDropHandler!: DragDropHandler;
    let hasDragDropHandler = false;

    getCurrentWebviewMock.mockReturnValue({
      onDragDropEvent: vi.fn((handler: DragDropHandler) => {
        dragDropHandler = handler;
        hasDragDropHandler = true;
        return Promise.resolve(() => {});
      }),
    });

    const parent = document.createElement("div");
    document.body.append(parent);

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: "hello",
        extensions: [dropImage()],
      }),
    });

    const contentLine = view.contentDOM.querySelector(".cm-line");
    const textNode = contentLine?.firstChild;
    if (!textNode) {
      throw new Error("Expected CodeMirror to render a text node");
    }

    setRect(view.dom, { x: 0, y: 0, width: 320, height: 200 });
    Object.defineProperty(document, "caretRangeFromPoint", {
      configurable: true,
      value: vi.fn(() => ({
        startContainer: textNode,
        startOffset: 2,
      })),
    });

    const focusSpy = vi.spyOn(view, "focus");

    if (!hasDragDropHandler) {
      throw new Error("Expected dropImage to register a drag handler");
    }

    dragDropHandler({
      payload: {
        type: "enter",
        paths: ["/images/example.png"],
        position: { x: 120, y: 80 },
      },
    });

    await Promise.resolve();

    expect(focusSpy).toHaveBeenCalledOnce();
    expect(view.state.selection.main.head).toBe(2);

    view.destroy();
  });
});
