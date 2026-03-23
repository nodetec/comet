import { useEffect, useRef, useState } from "react";
import { $generateHtmlFromNodes } from "@lexical/html";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TreeView } from "@lexical/react/LexicalTreeView";
import { Check, Copy, TextSelect } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { errorMessage } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

type DevtoolsPluginProps = {
  portalContainer: HTMLElement | null;
};

function formatDebugHtml(html: string): string {
  if (html.trim() === "") {
    return "(empty)";
  }

  const container = document.createElement("div");
  container.innerHTML = html.trim();
  return prettifyHtml(container, 0).innerHTML;
}

function prettifyHtml(node: Element, level: number): Element {
  const indentBefore = `${"  ".repeat(level)}`;
  const indentAfter = `${"  ".repeat(Math.max(level - 1, 0))}`;

  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    node.insertBefore(document.createTextNode(`\n${indentBefore}`), child);
    prettifyHtml(child, level + 1);

    if (child === node.lastElementChild) {
      node.append(document.createTextNode(`\n${indentAfter}`));
    }
  }

  return node;
}

export default function DevtoolsPlugin({
  portalContainer,
}: DevtoolsPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const treeViewRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
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

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyDebugData = async () => {
    try {
      const editorState = editor.getEditorState();
      let dom = "";

      editorState.read(() => {
        dom = formatDebugHtml($generateHtmlFromNodes(editor));
      });

      const lexicalAst = JSON.stringify(editorState.toJSON(), null, 2);
      const payload = `Lexical AST\n${lexicalAst}\n\nDOM\n${dom}`;

      await navigator.clipboard.writeText(payload);

      setCopied(true);
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copyResetTimeoutRef.current = null;
      }, 1500);
    } catch (error) {
      toast.error("Couldn't copy Lexical debug output", {
        description: errorMessage(error, "Clipboard write failed."),
      });
    }
  };

  const selectTreeViewContent = () => {
    const pre = treeViewRef.current?.querySelector("pre");
    if (!pre) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(pre);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleTreeViewKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "a"
    ) {
      event.preventDefault();
      event.stopPropagation();
      selectTreeViewContent();
    }
  };

  const handleTreeViewPointerDownCapture = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest("button, input, textarea, select, a")) {
      return;
    }

    treeViewRef.current?.focus({ preventScroll: true });
  };

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
        <TextSelect className="size-4" />
      </button>
      {open ? (
        <div className="border-border bg-background/95 absolute top-full right-0 z-10 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-xl backdrop-blur-sm">
          <div className="border-divider border-b px-3 py-2 text-sm font-medium">
            Lexical Tree
          </div>
          <div
            className="p-3"
            onKeyDown={handleTreeViewKeyDown}
            onPointerDownCapture={handleTreeViewPointerDownCapture}
            ref={treeViewRef}
            tabIndex={0}
          >
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
          <div className="border-divider border-t p-3 pt-0">
            <Button
              className="w-full justify-center"
              onClick={() => void handleCopyDebugData()}
              size="sm"
              variant="outline"
            >
              {copied ? (
                <Check className="size-3.5 text-green-600" />
              ) : (
                <Copy />
              )}
              {copied ? "Copied AST + DOM" : "Copy AST + DOM"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>,
    portalContainer,
  );
}
