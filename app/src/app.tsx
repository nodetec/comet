import { type CSSProperties, useEffect, useEffectEvent, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { useTheme } from "@/shared/hooks/use-theme";
import { Bar, Container, Section } from "@column-resizer/react";

import { Button } from "@/shared/ui/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Toaster } from "@/shared/ui/sonner";
import { AccountSwitcherDialog } from "@/features/settings/account-switcher-dialog";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { CommandPalette } from "@/features/command-palette";
import { EditorPane } from "@/features/shell/editor-pane";
import { NoteHistoryDialog } from "@/features/shell/note-history-dialog";
import { NotesPane } from "@/features/notes/ui/notes-pane";
import { PublishDialog, PublishShortNoteDialog } from "@/features/publishing";
import { SidebarPane } from "@/features/shell/sidebar-pane";
import { useRevealMainWindow } from "@/features/shell/use-reveal-main-window";
import { useShellController } from "@/features/shell/use-shell-controller";
import { useShellStore } from "@/features/shell/store/use-shell-store";
import { useUIStore } from "@/features/settings/store/use-ui-store";
import {
  dispatchFocusEditor,
  dispatchFocusNotesPane,
} from "@/shared/lib/pane-navigation";
import {
  getPaneFocusShortcut,
  isCommandPaletteShortcut,
  isEditorFindShortcut,
  isNotesSearchShortcut,
  isSidebarToggleShortcut,
} from "@/shared/lib/keyboard";

const TAURI_EVENT_COMMAND_PALETTE = "menu-command-palette";
const OPEN_EDITOR_FIND_EVENT = "comet:open-editor-find";
const TAURI_EVENT_EDITOR_FIND = "menu-editor-find";
const TAURI_EVENT_NEW_NOTE = "menu-new-note";
const TAURI_EVENT_NOTES_SEARCH = "menu-notes-search";
const TAURI_EVENT_SETTINGS = "menu-settings";

function conflictDialogCopy(hasDeleteCandidate: boolean) {
  if (hasDeleteCandidate) {
    return {
      description:
        "You can keep the deleted version, restore the note version currently shown, or merge the current draft into a new snapshot.",
      title: "Resolve this note conflict",
    };
  }

  return {
    description:
      "You can publish the version currently shown or merge the current draft into a new snapshot.",
    title: "Choose how to resolve this conflict",
  };
}

function App() {
  useTheme();
  const [isMacos] = useState(() => navigator.userAgent.includes("Mac"));
  const [hasCompletedStartupReveal, setHasCompletedStartupReveal] =
    useState(false);
  const {
    bootstrapError,
    chooseConflictDialogProps,
    deletePublishDialogProps,
    editorPaneProps,
    noteHistoryDialogProps,
    notesPaneProps,
    publishDialogProps,
    publishShortNoteDialogProps,
    readyToRevealWindow,
    retryBootstrap,
    sidebarPaneProps,
  } = useShellController();
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  useRevealMainWindow(!hasCompletedStartupReveal && !readyToRevealWindow);

  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setFocusedPane = useShellStore((s) => s.setFocusedPane);

  const openCommandPalette = useEffectEvent(() => {
    setCommandPaletteOpen(true);
  });

  const focusNotesSearch = useEffectEvent(() => {
    window.dispatchEvent(new CustomEvent("comet:focus-search"));
  });

  const openEditorFind = useEffectEvent(() => {
    window.dispatchEvent(new CustomEvent(OPEN_EDITOR_FIND_EVENT));
  });

  const focusPane = useEffectEvent((pane: "sidebar" | "notes" | "editor") => {
    if (pane === "editor") {
      dispatchFocusEditor();
      return;
    }

    if (pane === "notes") {
      dispatchFocusNotesPane();
      return;
    }

    setFocusedPane(pane);
  });

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isCommandPaletteShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openCommandPalette();
      return;
    }

    if (isSidebarToggleShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleSidebar();
      return;
    }

    if (isNotesSearchShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      focusNotesSearch();
      return;
    }

    if (isEditorFindShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openEditorFind();
      return;
    }

    const paneShortcut = getPaneFocusShortcut(event);
    if (paneShortcut) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      focusPane(paneShortcut);
      return;
    }

    if (!event.metaKey) return;

    const key = event.key.toLowerCase();
    switch (key) {
      case "s": {
        event.preventDefault();
        setAccountSwitcherOpen((open) => !open);
        break;
      }
      case ",": {
        break;
      }
      default: {
        break;
      }
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const handleCommandPaletteMenuEvent = useEffectEvent(() => {
    openCommandPalette();
  });

  const handleEditorFindMenuEvent = useEffectEvent(() => {
    openEditorFind();
  });

  const handleNewNoteMenuEvent = useEffectEvent(() => {
    notesPaneProps.onCreateNote();
  });

  const handleNotesSearchMenuEvent = useEffectEvent(() => {
    focusNotesSearch();
  });

  const handleSettingsMenuEvent = useEffectEvent(() => {
    setSettingsOpen(true);
  });

  useEffect(() => {
    let unlistenCommandPalette: (() => void) | null = null;
    let unlistenEditorFind: (() => void) | null = null;
    let unlistenNewNote: (() => void) | null = null;
    let unlistenNotesSearch: (() => void) | null = null;
    let unlistenSettings: (() => void) | null = null;

    void Promise.all([
      listen(TAURI_EVENT_COMMAND_PALETTE, handleCommandPaletteMenuEvent),
      listen(TAURI_EVENT_EDITOR_FIND, handleEditorFindMenuEvent),
      listen(TAURI_EVENT_NEW_NOTE, handleNewNoteMenuEvent),
      listen(TAURI_EVENT_NOTES_SEARCH, handleNotesSearchMenuEvent),
      listen(TAURI_EVENT_SETTINGS, handleSettingsMenuEvent),
    ]).then(
      ([
        disposeCommandPalette,
        disposeEditorFind,
        disposeNewNote,
        disposeNotesSearch,
        disposeSettings,
      ]) => {
        unlistenCommandPalette = disposeCommandPalette;
        unlistenEditorFind = disposeEditorFind;
        unlistenNewNote = disposeNewNote;
        unlistenNotesSearch = disposeNotesSearch;
        unlistenSettings = disposeSettings;
      },
    );

    return () => {
      unlistenCommandPalette?.();
      unlistenEditorFind?.();
      unlistenNewNote?.();
      unlistenNotesSearch?.();
      unlistenSettings?.();
    };
  }, []);

  useEffect(() => {
    if (readyToRevealWindow && !hasCompletedStartupReveal) {
      setHasCompletedStartupReveal(true);
    }
  }, [hasCompletedStartupReveal, readyToRevealWindow]);

  if (!hasCompletedStartupReveal && !readyToRevealWindow) {
    // Keep React mounted but the window hidden until startup data is ready.
    return null;
  }

  if (bootstrapError) {
    return (
      <div className="text-foreground flex min-h-screen items-center justify-center">
        <div className="border-border bg-card flex max-w-lg min-w-96 flex-col gap-4 rounded-xl border px-5 py-5 shadow-sm">
          <div className="space-y-1">
            <p className="font-semibold">Couldn&apos;t load your notes</p>
            <p className="text-muted-foreground text-sm">{bootstrapError}</p>
          </div>
          <div>
            <Button onClick={retryBootstrap}>Try again</Button>
          </div>
        </div>
      </div>
    );
  }

  const chooseConflictDialog = conflictDialogCopy(
    chooseConflictDialogProps.hasDeleteCandidate,
  );
  const defaultRestoreConflictLabel =
    chooseConflictDialogProps.hasDeleteCandidate
      ? "Restore note"
      : "Choose shown version";
  const restoreConflictLabel = chooseConflictDialogProps.pending
    ? "Restoring…"
    : defaultRestoreConflictLabel;

  return (
    <div
      className="text-foreground relative h-full min-h-0 overflow-hidden"
      style={
        {
          "--titlebar-height": isMacos ? "3.25rem" : "0px",
        } as CSSProperties
      }
    >
      <div className="relative h-full min-h-0">
        {isMacos ? (
          <div
            className="absolute inset-x-0 top-0 z-30 h-(--titlebar-height)"
            data-tauri-drag-region
          />
        ) : null}
        <Container
          className="h-full w-full"
          id="comet-shell"
          key={sidebarVisible ? "s" : "h"}
        >
          {sidebarVisible ? (
            <>
              <Section
                defaultSize={200}
                disableResponsive
                minSize={180}
                className="select-none"
              >
                <SidebarPane {...sidebarPaneProps} />
              </Section>
              <Bar
                className="bg-separator z-30 cursor-col-resize"
                expandInteractiveArea={{ left: 5, right: 5 }}
                size={1}
              />
            </>
          ) : null}

          <Section
            defaultSize={280}
            disableResponsive
            maxSize={340}
            minSize={220}
            className="select-none"
          >
            <NotesPane {...notesPaneProps} />
          </Section>

          <Bar
            className="bg-accent/35 z-30 cursor-col-resize"
            expandInteractiveArea={{ left: 5, right: 5 }}
            size={1}
          />

          <Section minSize={300}>
            <EditorPane {...editorPaneProps} />
          </Section>
        </Container>
      </div>
      <PublishDialog {...publishDialogProps} />
      <PublishShortNoteDialog {...publishShortNoteDialogProps} />
      <NoteHistoryDialog {...noteHistoryDialogProps} />
      <DialogRoot
        open={chooseConflictDialogProps.open}
        onOpenChange={chooseConflictDialogProps.onOpenChange}
      >
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup className="w-full max-w-sm p-6">
            <DialogTitle className="text-base font-semibold">
              {chooseConflictDialog.title}
            </DialogTitle>
            <p className="text-muted-foreground mt-2 text-sm">
              {chooseConflictDialog.description}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <DialogClose className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors">
                Cancel
              </DialogClose>
              {chooseConflictDialogProps.hasDeleteCandidate ? (
                <Button
                  disabled={chooseConflictDialogProps.pending}
                  onClick={chooseConflictDialogProps.onKeepDeleted}
                  size="sm"
                  variant="destructive"
                >
                  {chooseConflictDialogProps.pending
                    ? "Deleting…"
                    : "Keep deleted"}
                </Button>
              ) : null}
              <Button
                disabled={chooseConflictDialogProps.pending}
                onClick={chooseConflictDialogProps.onRestore}
                size="sm"
                variant="secondary"
              >
                {restoreConflictLabel}
              </Button>
              <Button
                disabled={chooseConflictDialogProps.pending}
                onClick={chooseConflictDialogProps.onMerge}
                size="sm"
                variant="default"
              >
                {chooseConflictDialogProps.pending ? "Merging…" : "Merge draft"}
              </Button>
            </div>
          </DialogPopup>
        </DialogPortal>
      </DialogRoot>
      <DialogRoot
        open={deletePublishDialogProps.open}
        onOpenChange={deletePublishDialogProps.onOpenChange}
      >
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup className="w-full max-w-sm p-6">
            <DialogTitle className="text-base font-semibold">
              Delete from Nostr?
            </DialogTitle>
            <p className="text-muted-foreground mt-2 text-sm">
              This will request relays to delete the published note. Relays may
              not honor the request, and copies may still exist elsewhere.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <DialogClose className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors">
                Cancel
              </DialogClose>
              <Button
                disabled={deletePublishDialogProps.pending}
                onClick={deletePublishDialogProps.onConfirm}
                size="sm"
                variant="destructive"
              >
                {deletePublishDialogProps.pending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </DialogPopup>
        </DialogPortal>
      </DialogRoot>
      <CommandPalette
        availableTagPaths={sidebarPaneProps.availableTagPaths}
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onSelectNote={notesPaneProps.onSelectNote}
        onSelectTagPath={sidebarPaneProps.onSelectTagPath}
      />
      <AccountSwitcherDialog
        open={accountSwitcherOpen}
        onOpenChange={setAccountSwitcherOpen}
      />
      <SettingsDialog />
      <Toaster closeButton position="bottom-right" richColors />
    </div>
  );
}

export default App;
