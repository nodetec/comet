import { startTransition, useEffect, useRef, useState } from "react";
import { $generateHtmlFromNodes } from "@lexical/html";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TreeView } from "@lexical/react/LexicalTreeView";
import {
  Check,
  Copy,
  Maximize2,
  Minimize2,
  TextSelect,
  TriangleAlertIcon,
} from "lucide-react";
import { type EditorState, type LexicalEditor } from "lexical";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { $exportMarkdown } from "../lib/markdown";
import { TRANSFORMERS } from "../transformers";

import { cn, errorMessage } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

type DevtoolsPluginProps = {
  portalContainer: HTMLElement | null;
};

type DebugPane = "structure" | "markdown";

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

function readMarkdownOutput(editorState: EditorState): string {
  let markdown = "";

  editorState.read(() => {
    markdown = $exportMarkdown(TRANSFORMERS);
  });

  return markdown === "" ? "(empty)" : markdown;
}

function buildStructurePayload(
  editor: LexicalEditor,
  editorState: EditorState,
): string {
  let dom = "";

  editorState.read(() => {
    dom = formatDebugHtml($generateHtmlFromNodes(editor));
  });

  const lexicalAst = JSON.stringify(editorState.toJSON(), null, 2);
  return `Lexical AST\n${lexicalAst}\n\nDOM\n${dom}`;
}

function buildCopyPayload(
  editor: LexicalEditor,
  editorState: EditorState,
  activePane: DebugPane,
): string {
  if (activePane === "markdown") {
    return readMarkdownOutput(editorState);
  }

  return buildStructurePayload(editor, editorState);
}

function getCopyErrorTitle(action: DebugPane): string {
  if (action === "markdown") {
    return "Couldn't copy markdown debug output";
  }

  return "Couldn't copy Lexical debug output";
}

function getCopyButtonLabel(
  activePane: DebugPane,
  copiedAction: DebugPane | null,
): string {
  if (activePane === "markdown") {
    return copiedAction === "markdown" ? "Copied Markdown" : "Copy Markdown";
  }

  return copiedAction === "structure" ? "Copied AST + DOM" : "Copy AST + DOM";
}

function copyDebugData(params: {
  activePane: DebugPane;
  copyResetTimeoutRef: React.RefObject<number | null>;
  editor: LexicalEditor;
  setCopiedAction: React.Dispatch<React.SetStateAction<DebugPane | null>>;
}) {
  const { activePane, copyResetTimeoutRef, editor, setCopiedAction } = params;
  const editorState = editor.getEditorState();
  const payload = buildCopyPayload(editor, editorState, activePane);

  navigator.clipboard
    .writeText(payload)
    .then(() => {
      resetCopyFeedback(activePane, copyResetTimeoutRef, setCopiedAction);
    })
    .catch((error: unknown) => {
      toast.error(getCopyErrorTitle(activePane), {
        description: errorMessage(error, "Clipboard write failed."),
      });
    });
}

function resetCopyFeedback(
  action: DebugPane,
  copyResetTimeoutRef: React.RefObject<number | null>,
  setCopiedAction: React.Dispatch<React.SetStateAction<DebugPane | null>>,
) {
  setCopiedAction(action);
  if (copyResetTimeoutRef.current !== null) {
    window.clearTimeout(copyResetTimeoutRef.current);
  }
  copyResetTimeoutRef.current = window.setTimeout(() => {
    setCopiedAction(null);
    copyResetTimeoutRef.current = null;
  }, 1500);
}

function selectPreContent(
  activePane: DebugPane,
  viewRef: React.RefObject<HTMLDivElement | null>,
) {
  const pre = viewRef.current?.querySelector(
    `[data-debug-pane="${activePane}"] pre`,
  );
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
}

function isSelectAllShortcut(event: React.KeyboardEvent<HTMLDivElement>) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    event.key.toLowerCase() === "a"
  );
}

function focusDebugView(
  event: React.PointerEvent<HTMLDivElement>,
  viewRef: React.RefObject<HTMLDivElement | null>,
) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.closest("button, input, textarea, select, a")) {
    return;
  }

  viewRef.current?.focus({ preventScroll: true });
}

function handleDebugPanelKeyDown(
  activePane: DebugPane,
  event: React.KeyboardEvent<HTMLDivElement>,
  viewRef: React.RefObject<HTMLDivElement | null>,
) {
  if (!isSelectAllShortcut(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  selectPreContent(activePane, viewRef);
}

type DebugPanelProps = {
  activePane: DebugPane;
  copiedAction: DebugPane | null;
  copyButtonLabel: string;
  debugTextViewClassName: string;
  editor: LexicalEditor;
  expanded: boolean;
  markdown: string;
  open: boolean;
  onCopyDebugData(): void;
  onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void;
  onPointerDownCapture(event: React.PointerEvent<HTMLDivElement>): void;
  onSetActivePane(pane: DebugPane): void;
  onToggleExpanded(): void;
  timeTravelActive: boolean;
  treeViewClassName: string;
  viewRef: React.RefObject<HTMLDivElement | null>;
};

function DebugPanel({
  activePane,
  copiedAction,
  copyButtonLabel,
  debugTextViewClassName,
  editor,
  expanded,
  markdown,
  open,
  onCopyDebugData,
  onKeyDown,
  onPointerDownCapture,
  onSetActivePane,
  onToggleExpanded,
  timeTravelActive,
  treeViewClassName,
  viewRef,
}: DebugPanelProps) {
  return (
    <div
      className={cn(
        "border-border bg-background/95 absolute top-full right-0 z-10 mt-2 flex flex-col overflow-hidden rounded-xl border shadow-xl backdrop-blur-sm transition-[opacity,transform,visibility] duration-150",
        open
          ? "pointer-events-auto visible translate-y-0 opacity-100"
          : "pointer-events-none invisible translate-y-1 opacity-0",
        expanded
          ? "h-[min(44rem,calc(100vh-4rem))] w-[min(52rem,calc(100vw-2rem))]"
          : "w-96 max-w-[calc(100vw-2rem)]",
      )}
    >
      <div className="border-divider flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-sm font-medium">Lexical Debugger</div>
        <div className="flex items-center gap-1">
          <Button
            onClick={() => onSetActivePane("structure")}
            size="xs"
            variant={activePane === "structure" ? "secondary" : "ghost"}
          >
            Structure
          </Button>
          <Button
            onClick={() => onSetActivePane("markdown")}
            size="xs"
            variant={activePane === "markdown" ? "secondary" : "ghost"}
          >
            Markdown
          </Button>
          <Button
            aria-label={expanded ? "Collapse debugger" : "Expand debugger"}
            onClick={onToggleExpanded}
            size="icon-xs"
            title={expanded ? "Collapse debugger" : "Expand debugger"}
            variant="ghost"
          >
            {expanded ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
      {timeTravelActive ? (
        <div className="border-divider border-b px-3 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
            <TriangleAlertIcon className="size-3.5 shrink-0" />
            <span>Editor is read-only while time travel is active.</span>
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "flex flex-col p-3 outline-none",
          expanded && "min-h-0 flex-1",
        )}
        onKeyDown={onKeyDown}
        onPointerDownCapture={onPointerDownCapture}
        ref={viewRef}
        tabIndex={0}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            activePane !== "structure" && "hidden",
          )}
          data-debug-pane="structure"
        >
          <TreeView
            editor={editor}
            timeTravelButtonClassName="comet-lexical-tree-button order-4 mt-2 mb-0 self-start"
            timeTravelPanelButtonClassName="comet-lexical-tree-button mb-0 mr-0"
            timeTravelPanelClassName="comet-lexical-tree-panel order-5 mt-2"
            timeTravelPanelSliderClassName="comet-lexical-tree-slider"
            treeTypeButtonClassName="comet-lexical-tree-button order-1 self-start"
            viewClassName={treeViewClassName}
          />
          <Button
            className="order-6 mt-3 w-full justify-center"
            onClick={onCopyDebugData}
            size="sm"
            variant="outline"
          >
            {copiedAction === activePane ? (
              <Check className="size-3.5 text-green-600" />
            ) : (
              <Copy />
            )}
            {copyButtonLabel}
          </Button>
        </div>
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            activePane !== "markdown" && "hidden",
          )}
          data-debug-pane="markdown"
        >
          <pre className={debugTextViewClassName}>{markdown}</pre>
        </div>
      </div>
      {activePane === "markdown" ? (
        <div className="border-divider border-t p-3 pt-0">
          <Button
            className="mt-3 w-full justify-center"
            onClick={onCopyDebugData}
            size="sm"
            variant="outline"
          >
            {copiedAction === activePane ? (
              <Check className="size-3.5 text-green-600" />
            ) : (
              <Copy />
            )}
            {copyButtonLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function useDevtoolsDismiss(
  isDev: boolean,
  open: boolean,
  setOpen: React.Dispatch<React.SetStateAction<boolean>>,
) {
  useEffect(() => {
    if (!isDev || !open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDev, open, setOpen]);
}

function useCopyResetTimeout(
  copyResetTimeoutRef: React.RefObject<number | null>,
) {
  useEffect(() => {
    const timeoutRef = copyResetTimeoutRef;

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [copyResetTimeoutRef]);
}

function useLiveMarkdown(
  editor: LexicalEditor,
  enabled: boolean,
  setMarkdown: React.Dispatch<React.SetStateAction<string>>,
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const syncMarkdown = (editorState = editor.getEditorState()) => {
      startTransition(() => {
        setMarkdown(readMarkdownOutput(editorState));
      });
    };

    syncMarkdown();

    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
          return;
        }

        syncMarkdown(editorState);
      },
    );
  }, [editor, enabled, setMarkdown]);
}

function useTimeTravelActive(
  viewRef: React.RefObject<HTMLDivElement | null>,
  setTimeTravelActive: React.Dispatch<React.SetStateAction<boolean>>,
) {
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    const syncTimeTravelActive = () => {
      setTimeTravelActive(
        view.querySelector(".comet-lexical-tree-panel") !== null,
      );
    };

    syncTimeTravelActive();

    const observer = new MutationObserver(() => {
      syncTimeTravelActive();
    });

    observer.observe(view, {
      attributeFilter: ["class"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [setTimeTravelActive, viewRef]);
}

export default function DevtoolsPlugin({
  portalContainer,
}: DevtoolsPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const [activePane, setActivePane] = useState<DebugPane>("structure");
  const [copiedAction, setCopiedAction] = useState<DebugPane | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [markdown, setMarkdown] = useState("(empty)");
  const [timeTravelActive, setTimeTravelActive] = useState(false);
  const viewRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const isDev = import.meta.env.DEV;
  const markdownPaneOpen = isDev && open && activePane === "markdown";

  useDevtoolsDismiss(isDev, open, setOpen);
  useCopyResetTimeout(copyResetTimeoutRef);
  useLiveMarkdown(editor, markdownPaneOpen, setMarkdown);
  useTimeTravelActive(viewRef, setTimeTravelActive);

  if (!isDev) {
    return null;
  }

  if (!portalContainer) {
    return null;
  }

  const copyButtonLabel = getCopyButtonLabel(activePane, copiedAction);
  const treeViewClassName = cn(
    "comet-lexical-tree-view",
    expanded && "comet-lexical-tree-view-expanded",
  );
  const debugTextViewClassName = cn(
    "comet-lexical-debug-text-view",
    expanded && "comet-lexical-debug-text-view-expanded",
  );

  return createPortal(
    <div className="pointer-events-none relative inline-flex flex-col items-end">
      <button
        aria-expanded={open}
        aria-label={open ? "Close Lexical tree view" : "Open Lexical tree view"}
        className="border-border bg-background/95 text-foreground hover:bg-accent hover:text-accent-foreground pointer-events-auto flex size-9 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-colors"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <TextSelect className="size-4" />
      </button>
      <DebugPanel
        activePane={activePane}
        copiedAction={copiedAction}
        copyButtonLabel={copyButtonLabel}
        debugTextViewClassName={debugTextViewClassName}
        editor={editor}
        expanded={expanded}
        markdown={markdown}
        open={open}
        onCopyDebugData={() => {
          copyDebugData({
            activePane,
            copyResetTimeoutRef,
            editor,
            setCopiedAction,
          });
        }}
        onKeyDown={(event) =>
          handleDebugPanelKeyDown(activePane, event, viewRef)
        }
        onPointerDownCapture={(event) => focusDebugView(event, viewRef)}
        onSetActivePane={setActivePane}
        onToggleExpanded={() => setExpanded((value) => !value)}
        timeTravelActive={timeTravelActive}
        treeViewClassName={treeViewClassName}
        viewRef={viewRef}
      />
    </div>,
    portalContainer,
  );
}
