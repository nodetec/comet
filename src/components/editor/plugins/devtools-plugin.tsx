import { useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TreeView } from "@lexical/react/LexicalTreeView";
import { Bug } from "lucide-react";
import { createPortal } from "react-dom";

type DevtoolsPluginProps = {
  portalContainer: HTMLElement | null;
};

export default function DevtoolsPlugin({
  portalContainer,
}: DevtoolsPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (!isDev || !open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDev, open]);

  if (!isDev) {
    return null;
  }

  if (!portalContainer) {
    return null;
  }

  return createPortal(
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-label={open ? "Close Lexical tree view" : "Open Lexical tree view"}
        className="border-border bg-background/95 text-foreground hover:bg-accent hover:text-accent-foreground flex size-9 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-colors"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Bug className="size-4" />
      </button>
      {open ? (
        <div className="border-border bg-background/95 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-xl backdrop-blur-sm">
          <div className="border-divider border-b px-3 py-2 text-sm font-medium">
            Lexical Tree
          </div>
          <div className="p-3">
            <TreeView
              editor={editor}
              timeTravelButtonClassName="comet-lexical-tree-button"
              timeTravelPanelButtonClassName="comet-lexical-tree-button"
              timeTravelPanelClassName="comet-lexical-tree-panel"
              timeTravelPanelSliderClassName="comet-lexical-tree-slider"
              treeTypeButtonClassName="comet-lexical-tree-button"
              viewClassName="comet-lexical-tree-view"
            />
          </div>
        </div>
      ) : null}
    </div>,
    portalContainer,
  );
}
