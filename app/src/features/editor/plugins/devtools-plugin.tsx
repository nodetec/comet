import { startTransition, useEffect, useRef, useState } from "react";
import { $generateHtmlFromNodes } from "@lexical/html";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TreeView } from "@lexical/react/LexicalTreeView";
import {
  Check,
  ChevronDown,
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

type DebugPane = "tree" | "dom" | "markdown";
type TimeTravelSnapshot = readonly [number, EditorState];

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

  return copiedAction === "tree" || copiedAction === "dom"
    ? "Copied AST + DOM"
    : "Copy AST + DOM";
}

function getLastSnapshot(
  snapshots: TimeTravelSnapshot[],
): TimeTravelSnapshot | undefined {
  let lastSnapshot: TimeTravelSnapshot | undefined;
  for (const snapshot of snapshots) {
    lastSnapshot = snapshot;
  }
  return lastSnapshot;
}

function getTreePaneTarget(activePane: DebugPane): "tree" | "markdown" {
  return activePane === "markdown" ? "markdown" : "tree";
}

function shouldShowExportDom(activePane: DebugPane) {
  return activePane === "dom";
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
    `[data-debug-pane="${getTreePaneTarget(activePane)}"] pre`,
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
  isPlayingTimeTravel: boolean;
  markdown: string;
  open: boolean;
  onCopyDebugData(): void;
  onExitTimeTravel(): void;
  onStartTimeTravel(): void;
  onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void;
  onPointerDownCapture(event: React.PointerEvent<HTMLDivElement>): void;
  onSetActivePane(pane: DebugPane): void;
  onSetTimeTravelIndex(index: number): void;
  onToggleTimeTravelPlayback(): void;
  onToggleExpanded(): void;
  timeTravelActive: boolean;
  timeTravelAvailable: boolean;
  timeTravelMaxIndex: number;
  timeTravelIndex: number;
  treeViewClassName: string;
  viewRef: React.RefObject<HTMLDivElement | null>;
};

type TreeDebugPaneProps = {
  copiedAction: DebugPane | null;
  copyButtonLabel: string;
  editor: LexicalEditor;
  isPlayingTimeTravel: boolean;
  onCopyDebugData(): void;
  onExitTimeTravel(): void;
  onSetTimeTravelIndex(index: number): void;
  onStartTimeTravel(): void;
  onToggleTimeTravelPlayback(): void;
  timeTravelActive: boolean;
  timeTravelAvailable: boolean;
  timeTravelIndex: number;
  timeTravelMaxIndex: number;
  treeViewClassName: string;
};

function TreeDebugPane({
  copiedAction,
  copyButtonLabel,
  editor,
  isPlayingTimeTravel,
  onCopyDebugData,
  onExitTimeTravel,
  onSetTimeTravelIndex,
  onStartTimeTravel,
  onToggleTimeTravelPlayback,
  timeTravelActive,
  timeTravelAvailable,
  timeTravelIndex,
  timeTravelMaxIndex,
  treeViewClassName,
}: TreeDebugPaneProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-debug-pane="tree">
      <TreeView
        editor={editor}
        timeTravelButtonClassName="hidden"
        timeTravelPanelButtonClassName="hidden"
        timeTravelPanelClassName="hidden"
        timeTravelPanelSliderClassName="hidden"
        treeTypeButtonClassName="comet-lexical-tree-mode-button hidden ml-3 self-start"
        viewClassName={treeViewClassName}
      />
      {timeTravelActive ? (
        <div className="comet-lexical-tree-panel border-separator order-5 self-stretch border-t px-3 pt-3 pb-3">
          <Button
            className="w-auto justify-center"
            onClick={onToggleTimeTravelPlayback}
            size="sm"
            variant="outline"
          >
            {isPlayingTimeTravel ? "Pause" : "Play"}
          </Button>
          <input
            aria-label="Time travel position"
            className="comet-lexical-tree-slider self-center"
            max={timeTravelMaxIndex}
            min={1}
            onChange={(event) => {
              onSetTimeTravelIndex(Number(event.target.value));
            }}
            type="range"
            value={timeTravelIndex}
          />
          <Button
            className="w-auto justify-center"
            onClick={onExitTimeTravel}
            size="sm"
            variant="outline"
          >
            Exit
          </Button>
        </div>
      ) : null}
      <div className="border-separator order-6 flex justify-start border-t px-3 pt-3 pb-3">
        <Button
          className={cn(
            "w-auto justify-center",
            (copiedAction === "tree" || copiedAction === "dom") &&
              "border-success-border bg-success-surface text-success hover:bg-success-surface",
          )}
          onClick={onCopyDebugData}
          size="sm"
          variant="outline"
        >
          {copiedAction === "tree" || copiedAction === "dom" ? (
            <Check className="text-success size-3.5" />
          ) : (
            <Copy />
          )}
          {copyButtonLabel}
        </Button>
        {timeTravelAvailable && !timeTravelActive ? (
          <Button
            className="ml-2 w-auto justify-center"
            onClick={onStartTimeTravel}
            size="sm"
            variant="outline"
          >
            Time Travel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TimeTravelWarning() {
  return (
    <div className="border-separator border-b px-3 py-2">
      <div className="border-warning-border bg-warning-surface text-warning flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs">
        <TriangleAlertIcon className="size-3.5 shrink-0" />
        <span>Editor is read-only while time travel is active.</span>
      </div>
    </div>
  );
}

function DebugPanel({
  activePane,
  copiedAction,
  copyButtonLabel,
  debugTextViewClassName,
  editor,
  expanded,
  isPlayingTimeTravel,
  markdown,
  open,
  onCopyDebugData,
  onExitTimeTravel,
  onStartTimeTravel,
  onKeyDown,
  onPointerDownCapture,
  onSetActivePane,
  onSetTimeTravelIndex,
  onToggleTimeTravelPlayback,
  onToggleExpanded,
  timeTravelActive,
  timeTravelAvailable,
  timeTravelIndex,
  timeTravelMaxIndex,
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
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Lexical Debugger</div>
          <div className="flex items-center gap-1">
            <label className="border-border bg-background/80 text-foreground focus-within:border-ring focus-within:ring-ring/50 relative flex h-6 items-center rounded-md border px-2 text-xs focus-within:ring-3">
              <span className="text-muted-foreground mr-1.5">View</span>
              <select
                aria-label="Debugger view"
                className="text-foreground h-full appearance-none bg-transparent pr-5 outline-none"
                onChange={(event) =>
                  onSetActivePane(event.target.value as DebugPane)
                }
                value={activePane}
              >
                <option value="tree">Tree</option>
                <option value="dom">Export DOM</option>
                <option value="markdown">Markdown</option>
              </select>
              <ChevronDown className="text-muted-foreground pointer-events-none absolute right-2 size-3.5" />
            </label>
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
      </div>
      <div className="border-separator border-b" />
      {timeTravelActive ? <TimeTravelWarning /> : null}
      <div
        className={cn(
          "flex flex-col outline-none",
          expanded && "min-h-0 flex-1",
        )}
        onKeyDown={onKeyDown}
        onPointerDownCapture={onPointerDownCapture}
        ref={viewRef}
        tabIndex={0}
      >
        {activePane === "markdown" ? null : (
          <TreeDebugPane
            copiedAction={copiedAction}
            copyButtonLabel={copyButtonLabel}
            editor={editor}
            isPlayingTimeTravel={isPlayingTimeTravel}
            onCopyDebugData={onCopyDebugData}
            onExitTimeTravel={onExitTimeTravel}
            onSetTimeTravelIndex={onSetTimeTravelIndex}
            onStartTimeTravel={onStartTimeTravel}
            onToggleTimeTravelPlayback={onToggleTimeTravelPlayback}
            timeTravelActive={timeTravelActive}
            timeTravelAvailable={timeTravelAvailable}
            timeTravelIndex={timeTravelIndex}
            timeTravelMaxIndex={timeTravelMaxIndex}
            treeViewClassName={treeViewClassName}
          />
        )}
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
        <div className="border-separator border-t p-3 pt-0">
          <Button
            className={cn(
              "mt-3 w-full justify-center",
              copiedAction === activePane &&
                "border-success-border bg-success-surface text-success hover:bg-success-surface",
            )}
            onClick={onCopyDebugData}
            size="sm"
            variant="outline"
          >
            {copiedAction === activePane ? (
              <Check className="text-success size-3.5" />
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

function useTreeViewMode(
  activePane: DebugPane,
  viewRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (activePane === "markdown") {
      return;
    }

    const modeButton = viewRef.current?.querySelector(
      ".comet-lexical-tree-mode-button",
    );
    if (!(modeButton instanceof HTMLButtonElement)) {
      return;
    }

    const isExportDomVisible = modeButton.textContent?.trim() === "Tree";
    const shouldExportDomBeVisible = shouldShowExportDom(activePane);

    if (isExportDomVisible !== shouldExportDomBeVisible) {
      modeButton.click();
    }
  }, [activePane, viewRef]);
}

function useTimeTravel(editor: LexicalEditor, open: boolean) {
  const [timeTravelSnapshots, setTimeTravelSnapshots] = useState<
    TimeTravelSnapshot[]
  >([]);
  const [timeTravelAvailable, setTimeTravelAvailable] = useState(false);
  const [timeTravelActive, setTimeTravelActive] = useState(false);
  const [timeTravelIndex, setTimeTravelIndex] = useState(1);
  const [isPlayingTimeTravel, setIsPlayingTimeTravel] = useState(false);
  const lastSnapshotStateRef = useRef<EditorState | null>(null);
  const editableBeforeTimeTravelRef = useRef(true);
  const timeTravelActiveRef = useRef(false);
  const timeTravelSnapshotsRef = useRef<TimeTravelSnapshot[]>([]);

  useEffect(() => {
    timeTravelActiveRef.current = timeTravelActive;
  }, [timeTravelActive]);

  useEffect(() => {
    timeTravelSnapshotsRef.current = timeTravelSnapshots;
  }, [timeTravelSnapshots]);

  useEffect(() => {
    const initialState = editor.getEditorState();
    lastSnapshotStateRef.current = initialState;
    const initialSnapshots = [[Date.now(), initialState] as TimeTravelSnapshot];
    timeTravelSnapshotsRef.current = initialSnapshots;
    setTimeTravelSnapshots(initialSnapshots);

    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
          return;
        }

        if (
          timeTravelActiveRef.current ||
          lastSnapshotStateRef.current === editorState
        ) {
          return;
        }

        lastSnapshotStateRef.current = editorState;
        setTimeTravelSnapshots((currentSnapshots) => {
          const nextSnapshot: TimeTravelSnapshot = [Date.now(), editorState];
          const nextSnapshots = [...currentSnapshots, nextSnapshot];
          const trimmedSnapshots = nextSnapshots.slice(-200);
          timeTravelSnapshotsRef.current = trimmedSnapshots;
          return trimmedSnapshots;
        });
      },
    );
  }, [editor]);

  useEffect(() => {
    setTimeTravelAvailable(timeTravelSnapshots.length > 1);
    if (!timeTravelActive) {
      setTimeTravelIndex(Math.max(1, timeTravelSnapshots.length - 1));
    }
  }, [timeTravelActive, timeTravelSnapshots]);

  useEffect(() => {
    if (!open && timeTravelActive) {
      setIsPlayingTimeTravel(false);
      setTimeTravelActive(false);
      const latestSnapshot = getLastSnapshot(timeTravelSnapshotsRef.current);
      if (latestSnapshot) {
        lastSnapshotStateRef.current = latestSnapshot[1];
        editor.setEditorState(latestSnapshot[1]);
      }
      editor.setEditable(editableBeforeTimeTravelRef.current);
    }
  }, [editor, open, timeTravelActive]);

  useEffect(() => {
    if (!timeTravelActive) {
      return;
    }

    const snapshot = timeTravelSnapshots[timeTravelIndex];
    if (snapshot) {
      editor.setEditorState(snapshot[1]);
    }
  }, [editor, timeTravelActive, timeTravelIndex, timeTravelSnapshots]);

  useEffect(() => {
    if (!isPlayingTimeTravel || !timeTravelActive) {
      return;
    }

    if (timeTravelIndex >= timeTravelSnapshots.length - 1) {
      setIsPlayingTimeTravel(false);
      return;
    }

    const currentSnapshot = timeTravelSnapshots[timeTravelIndex];
    const nextSnapshot = timeTravelSnapshots[timeTravelIndex + 1];
    if (!currentSnapshot || !nextSnapshot) {
      setIsPlayingTimeTravel(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setTimeTravelIndex((currentIndex) =>
        Math.min(currentIndex + 1, timeTravelSnapshots.length - 1),
      );
    }, nextSnapshot[0] - currentSnapshot[0]);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    isPlayingTimeTravel,
    timeTravelActive,
    timeTravelIndex,
    timeTravelSnapshots,
  ]);

  const startTimeTravel = () => {
    const snapshotCount = timeTravelSnapshotsRef.current.length;
    if (snapshotCount < 2) {
      return;
    }

    editableBeforeTimeTravelRef.current = editor.isEditable();
    editor.setEditable(false);
    setTimeTravelActive(true);
    setIsPlayingTimeTravel(false);
    setTimeTravelIndex(snapshotCount - 1);
  };

  const toggleTimeTravelPlayback = () => {
    const lastIndex = timeTravelSnapshotsRef.current.length - 1;
    if (timeTravelIndex >= lastIndex) {
      setTimeTravelIndex(1);
    }
    setIsPlayingTimeTravel((currentValue) => !currentValue);
  };

  const exitTimeTravel = () => {
    setIsPlayingTimeTravel(false);
    setTimeTravelActive(false);
    const latestSnapshot = getLastSnapshot(timeTravelSnapshots);
    if (latestSnapshot) {
      lastSnapshotStateRef.current = latestSnapshot[1];
      editor.setEditorState(latestSnapshot[1]);
    }
    editor.setEditable(editableBeforeTimeTravelRef.current);
  };

  return {
    exitTimeTravel,
    isPlayingTimeTravel,
    setTimeTravelIndex,
    startTimeTravel,
    timeTravelActive,
    timeTravelAvailable,
    timeTravelIndex,
    timeTravelMaxIndex: Math.max(1, timeTravelSnapshots.length - 1),
    toggleTimeTravelPlayback,
  };
}

export default function DevtoolsPlugin({
  portalContainer,
}: DevtoolsPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [open, setOpen] = useState(false);
  const [activePane, setActivePane] = useState<DebugPane>("tree");
  const [copiedAction, setCopiedAction] = useState<DebugPane | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [markdown, setMarkdown] = useState("(empty)");
  const viewRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const isDev = import.meta.env.DEV;
  const markdownPaneOpen = isDev && open && activePane === "markdown";
  const {
    exitTimeTravel,
    isPlayingTimeTravel,
    setTimeTravelIndex,
    startTimeTravel,
    timeTravelActive,
    timeTravelAvailable,
    timeTravelIndex,
    timeTravelMaxIndex,
    toggleTimeTravelPlayback,
  } = useTimeTravel(editor, open);

  useDevtoolsDismiss(isDev, open, setOpen);
  useCopyResetTimeout(copyResetTimeoutRef);
  useLiveMarkdown(editor, markdownPaneOpen, setMarkdown);
  useTreeViewMode(activePane, viewRef);

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
        isPlayingTimeTravel={isPlayingTimeTravel}
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
        onExitTimeTravel={exitTimeTravel}
        onSetTimeTravelIndex={setTimeTravelIndex}
        onStartTimeTravel={startTimeTravel}
        onKeyDown={(event) =>
          handleDebugPanelKeyDown(activePane, event, viewRef)
        }
        onPointerDownCapture={(event) => focusDebugView(event, viewRef)}
        onSetActivePane={setActivePane}
        onToggleTimeTravelPlayback={toggleTimeTravelPlayback}
        onToggleExpanded={() => setExpanded((value) => !value)}
        timeTravelActive={timeTravelActive}
        timeTravelAvailable={timeTravelAvailable}
        timeTravelIndex={timeTravelIndex}
        timeTravelMaxIndex={timeTravelMaxIndex}
        treeViewClassName={treeViewClassName}
        viewRef={viewRef}
      />
    </div>,
    portalContainer,
  );
}
