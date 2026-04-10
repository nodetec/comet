import { type CSSProperties, useEffect, useState } from "react";

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
import { useAppShortcuts } from "@/features/shell/use-app-shortcuts";
import { useRevealMainWindow } from "@/features/shell/use-reveal-main-window";
import { useShellController } from "@/features/shell/use-shell-controller";
import { useUIStore } from "@/features/settings/store/use-ui-store";
import { conflictDialogCopy } from "@/shared/lib/conflict-dialog-copy";

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

  const {
    accountSwitcherOpen,
    commandPaletteOpen,
    setAccountSwitcherOpen,
    setCommandPaletteOpen,
  } = useAppShortcuts({ onCreateNote: notesPaneProps.onCreateNote });

  useRevealMainWindow(!hasCompletedStartupReveal && !readyToRevealWindow);

  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const notesPanelVisible = useUIStore((s) => s.notesPanelVisible);

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
        <Container className="h-full w-full" id="comet-shell">
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

          {notesPanelVisible ? (
            <>
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
            </>
          ) : null}

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
