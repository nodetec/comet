import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { type LexicalEditor } from "lexical";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { IMAGE_EXTENSIONS, importImage } from "@/shared/lib/attachments";
import { $insertImportedImages } from "../lib/image-insert";

const IMAGE_EXTENSIONS_RE = new RegExp(
  String.raw`\.(${IMAGE_EXTENSIONS.join("|")})$`,
  "i",
);

function isImagePath(p: string): boolean {
  return IMAGE_EXTENSIONS_RE.test(p);
}

function isInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function focusCaretAtPoint(
  rootElement: HTMLElement,
  x: number,
  y: number,
): void {
  rootElement.focus();
  // eslint-disable-next-line sonarjs/deprecation -- caretRangeFromPoint needed for browser compat
  const range = document.caretRangeFromPoint(x, y);
  if (range) {
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

async function handleDrop(
  editor: LexicalEditor,
  rootElement: HTMLElement,
  payload: { position: { x: number; y: number }; paths: string[] },
): Promise<void> {
  const { x, y } = payload.position;
  const rect = getEditorRect(rootElement);
  if (!isInsideRect(x, y, rect)) return;

  const imagePaths = payload.paths.filter((p) => isImagePath(p));
  if (imagePaths.length === 0) return;

  const results = await Promise.all(
    imagePaths.map((p) => importImage(p).catch(() => null)),
  );

  editor.update(() => {
    $insertImportedImages(results);
  });
}

function getEditorRect(rootElement: HTMLElement): DOMRect {
  const scrollContainer = rootElement.closest(".comet-editor-shell");
  return (scrollContainer ?? rootElement).getBoundingClientRect();
}

export default function ImageDropPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    let hasImageFiles = false;
    let rafId: number | null = null;

    const handleOverRAF = (root: HTMLElement, x: number, y: number) => {
      rafId = null;
      const rect = getEditorRect(root);
      if (!isInsideRect(x, y, rect)) return;
      focusCaretAtPoint(root, x, y);
    };

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        void (async () => {
          if (cancelled) return;

          const rootElement = editor.getRootElement();
          if (!rootElement || !editor.isEditable()) return;

          if (event.payload.type === "enter") {
            hasImageFiles = event.payload.paths.some(isImagePath);
            return;
          }

          if (event.payload.type === "leave") {
            hasImageFiles = false;
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            return;
          }

          if (!hasImageFiles) return;

          if (event.payload.type === "over") {
            const { x, y } = event.payload.position;
            if (rafId !== null) return;
            rafId = requestAnimationFrame(
              handleOverRAF.bind(null, rootElement, x, y),
            );
            return;
          }

          if (event.payload.type === "drop") {
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            await handleDrop(editor, rootElement, event.payload);
          }
        })();
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [editor]);

  return null;
}
