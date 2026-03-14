import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $setSelection,
} from "lexical";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { IMAGE_EXTENSIONS, importImage } from "@/lib/attachments";
import { $createImageNode } from "../nodes/image-node";

const IMAGE_EXTENSIONS_RE = new RegExp(
  `\\.(${IMAGE_EXTENSIONS.join("|")})$`,
  "i",
);

function isInsideRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export default function ImageDropPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    let hasImageFiles = false;
    let rafId: number | null = null;

    getCurrentWebview()
      .onDragDropEvent(async (event) => {
        if (cancelled) return;

        const rootElement = editor.getRootElement();
        if (!rootElement || !editor.isEditable()) return;

        if (event.payload.type === "enter") {
          hasImageFiles = event.payload.paths.some((p) =>
            IMAGE_EXTENSIONS_RE.test(p),
          );
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
          rafId = requestAnimationFrame(() => {
            rafId = null;
            const scrollContainer = rootElement.closest(".comet-editor-shell");
            const rect = (
              scrollContainer ?? rootElement
            ).getBoundingClientRect();
            if (!isInsideRect(x, y, rect)) return;

            rootElement.focus();
            const range = document.caretRangeFromPoint(x, y);
            if (range) {
              const sel = window.getSelection();
              if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
          });
          return;
        }

        if (event.payload.type === "drop") {
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }

          const { x, y } = event.payload.position;
          const scrollContainer = rootElement.closest(".comet-editor-shell");
          const rect = (scrollContainer ?? rootElement).getBoundingClientRect();
          if (!isInsideRect(x, y, rect)) return;

          const imagePaths = event.payload.paths.filter((p) =>
            IMAGE_EXTENSIONS_RE.test(p),
          );
          if (imagePaths.length === 0) return;

          const results = await Promise.all(
            imagePaths.map((p) => importImage(p).catch(() => null)),
          );

          editor.update(() => {
            for (const result of results) {
              if (!result) continue;
              const imageNode = $createImageNode({
                src: result.assetUrl,
                altText: result.altText,
              });
              const selection = $getSelection();
              if ($isNodeSelection(selection)) {
                const nodes = selection.getNodes();
                const lastNode = nodes[nodes.length - 1];
                lastNode.getTopLevelElementOrThrow().insertAfter(imageNode);
              } else if (selection) {
                selection.insertNodes([imageNode]);
              } else {
                $getRoot().append(imageNode);
              }
              const nodeSelection = $createNodeSelection();
              nodeSelection.add(imageNode.getKey());
              $setSelection(nodeSelection);
            }
          });
        }
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
