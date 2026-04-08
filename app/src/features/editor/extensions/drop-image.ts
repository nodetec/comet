import { EditorSelection } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { getContentSelectionHeadFromPoint } from "@/features/editor/lib/note-editor-selection";
import {
  IMAGE_EXTENSIONS,
  importImage,
  importImageBytes,
  unresolveImageSrc,
} from "@/shared/lib/attachments";

function getImagePaths(paths: string[]): string[] {
  return paths.filter((p) => {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    return IMAGE_EXTENSIONS.includes(ext);
  });
}

function getImageFiles(files: FileList): File[] {
  return [...files].filter((f) => f.type.startsWith("image/"));
}

const DRAG_OVER_CLASS = "cm-drag-over";

const dragOverTheme = EditorView.baseTheme({
  "&.cm-drag-over .cm-cursorLayer .cm-cursor": {
    display: "block !important",
  },
});

type WebviewDropPosition = {
  x: number;
  y: number;
  toLogical?(scaleFactor: number): { x: number; y: number };
};

type CaretRangeDocument = Document & {
  caretPositionFromPoint?: (
    x: number,
    y: number,
  ) => { offset: number; offsetNode: Node } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

function toLogicalClientPoint(position: WebviewDropPosition) {
  if (typeof position.toLogical === "function") {
    return position.toLogical(window.devicePixelRatio);
  }

  return {
    x: position.x / window.devicePixelRatio,
    y: position.y / window.devicePixelRatio,
  };
}

function getCandidateClientPoints(position: WebviewDropPosition) {
  const candidates = [
    toLogicalClientPoint(position),
    { x: position.x, y: position.y },
  ];

  return candidates.filter((candidate, index) => {
    return (
      index ===
      candidates.findIndex((other) => {
        return other.x === candidate.x && other.y === candidate.y;
      })
    );
  });
}

function isPointInsideRect(
  rect: DOMRect | DOMRectReadOnly,
  x: number,
  y: number,
) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function getDomCaretFromPoint(x: number, y: number) {
  const documentWithCaret = document as CaretRangeDocument;
  const position = documentWithCaret.caretPositionFromPoint?.(x, y);
  if (position) {
    return {
      offset: position.offset,
      offsetNode: position.offsetNode,
    };
  }

  // WebKit still exposes the deprecated range API where caretPositionFromPoint
  // is unavailable during native file drags.
  // eslint-disable-next-line sonarjs/deprecation
  const range = documentWithCaret.caretRangeFromPoint?.(x, y);
  if (range) {
    return {
      offset: range.startOffset,
      offsetNode: range.startContainer,
    };
  }

  return null;
}

function getDropPositionFromDomCaret(view: EditorView, x: number, y: number) {
  const caret = getDomCaretFromPoint(x, y);
  if (!caret) {
    return null;
  }

  const { offsetNode, offset } = caret;
  if (
    offsetNode === view.dom ||
    offsetNode === view.contentDOM ||
    !view.contentDOM.contains(offsetNode)
  ) {
    return null;
  }

  try {
    return view.posAtDOM(offsetNode, offset);
  } catch {
    return null;
  }
}

function getDropPositionFromClientPoint(
  view: EditorView,
  clientX: number,
  clientY: number,
) {
  if (!isPointInsideRect(view.dom.getBoundingClientRect(), clientX, clientY)) {
    return null;
  }

  const domPos = getDropPositionFromDomCaret(view, clientX, clientY);
  if (domPos != null) {
    return domPos;
  }

  const cmPos = view.posAtCoords({ x: clientX, y: clientY }, false);
  if (cmPos != null) {
    return cmPos;
  }

  const head = getContentSelectionHeadFromPoint(
    view,
    document.elementFromPoint(clientX, clientY),
    clientX,
    clientY,
  );

  return head?.head ?? null;
}

export function getDropPositionFromWebviewPoint(
  view: EditorView,
  position: WebviewDropPosition,
) {
  for (const candidate of getCandidateClientPoints(position)) {
    const pos = getDropPositionFromClientPoint(view, candidate.x, candidate.y);
    if (pos != null) {
      return pos;
    }
  }

  return null;
}

/**
 * Drag-and-drop image support.
 *
 * Tauri intercepts OS file drags before DOM events reach the webview, so we use
 * Tauri `onDragDropEvent` for both cursor tracking and file paths. DOM `drop` is
 * tried first as a fast path when `dataTransfer.files` is available.
 */
export function dropImage() {
  const plugin = ViewPlugin.fromClass(
    class {
      private unlisten: (() => void) | null = null;
      lastDropPos: number | null = null;
      private imagePaths: string[] = [];
      dropHandled = false;

      constructor(readonly view: EditorView) {
        this.setup();
      }

      private handleEnter(position: WebviewDropPosition, paths: string[]) {
        this.imagePaths = getImagePaths(paths);
        this.dropHandled = false;
        if (this.imagePaths.length > 0) {
          this.updateCursorFromTauri(position);
        }
      }

      private handleOver(position: WebviewDropPosition) {
        if (this.imagePaths.length > 0) {
          this.updateCursorFromTauri(position);
        }
      }

      private handleDrop(position: WebviewDropPosition, paths: string[]) {
        if (this.dropHandled) {
          this.reset();
          return;
        }

        const imagePaths = getImagePaths(paths);
        const pos = getDropPositionFromWebviewPoint(this.view, position);
        if (pos != null) {
          this.lastDropPos = pos;
        }
        if (imagePaths.length > 0) {
          this.insertAtDropPos(() => Promise.all(imagePaths.map(importImage)));
        }
        this.reset();
      }

      private setup() {
        const webview = getCurrentWebview();
        void webview
          .onDragDropEvent((event) => {
            const { payload } = event;

            switch (payload.type) {
              case "enter": {
                this.handleEnter(payload.position, payload.paths);
                break;
              }
              case "over": {
                this.handleOver(payload.position);
                break;
              }
              case "drop": {
                this.handleDrop(payload.position, payload.paths);
                break;
              }
              case "leave": {
                this.reset();
                break;
              }
            }
          })
          .then((unlisten) => {
            this.unlisten = unlisten;
          });
      }

      private updateCursorFromTauri(position: WebviewDropPosition) {
        const pos = getDropPositionFromWebviewPoint(this.view, position);
        if (pos == null) {
          return;
        }

        this.lastDropPos = pos;
        if (!this.view.hasFocus) {
          this.view.focus();
        }
        this.view.dom.classList.add(DRAG_OVER_CLASS);
        this.view.dispatch({
          scrollIntoView: false,
          selection: EditorSelection.cursor(pos),
        });
      }

      insertAtDropPos(
        importFn: () => Promise<{ altText: string; assetUrl: string }[]>,
      ) {
        const pos = this.lastDropPos ?? this.view.state.selection.main.head;

        const placeholder = "![uploading...]()";
        this.view.dispatch({
          changes: { from: pos, insert: placeholder },
          selection: EditorSelection.cursor(pos + placeholder.length),
        });

        void importFn()
          .then((results) => {
            const markdown = results
              .map((r) => `![${r.altText}](${unresolveImageSrc(r.assetUrl)})`)
              .join("\n");

            const current = this.view.state.sliceDoc(
              pos,
              pos + placeholder.length,
            );
            if (current !== placeholder) return;

            this.view.dispatch({
              changes: {
                from: pos,
                to: pos + placeholder.length,
                insert: markdown,
              },
            });
          })
          .catch(() => {
            const current = this.view.state.sliceDoc(
              pos,
              pos + placeholder.length,
            );
            if (current !== placeholder) return;

            this.view.dispatch({
              changes: { from: pos, to: pos + placeholder.length, insert: "" },
            });
          });
      }

      private reset() {
        this.lastDropPos = null;
        this.imagePaths = [];
        this.dropHandled = false;
        this.view.dom.classList.remove(DRAG_OVER_CLASS);
      }

      destroy() {
        this.unlisten?.();
        this.view.dom.classList.remove(DRAG_OVER_CLASS);
      }
    },
    {
      eventHandlers: {
        drop(event) {
          if (!event.dataTransfer) return false;

          const selection = getContentSelectionHeadFromPoint(
            this.view,
            event.target,
            event.clientX,
            event.clientY,
          );
          if (selection) {
            this.lastDropPos = selection.head;
          }

          const files = getImageFiles(event.dataTransfer.files);
          if (files.length > 0) {
            event.preventDefault();
            this.dropHandled = true;
            this.insertAtDropPos(() =>
              Promise.all(
                files.map(async (file) => {
                  const bytes = new Uint8Array(await file.arrayBuffer());
                  return importImageBytes(bytes);
                }),
              ),
            );
            return true;
          }

          return false;
        },
      },
    },
  );

  return [plugin, dragOverTheme];
}
