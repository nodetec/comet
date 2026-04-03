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
import { NotesPane } from "@/features/notes/ui/notes-pane";
import { PublishDialog, PublishShortNoteDialog } from "@/features/publishing";
import { SidebarPane } from "@/features/shell/sidebar-pane";
import { useRevealMainWindow } from "@/features/shell/use-reveal-main-window";
import { useShellController } from "@/features/shell/use-shell-controller";
import { useUIStore } from "@/features/settings/store/use-ui-store";

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
    notesPaneProps,
    publishDialogProps,
    publishShortNoteDialogProps,
    readyToRevealWindow,
    retryBootstrap,
    sidebarPaneProps,
  } = useShellController();
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const handleCreateNoteShortcut = notesPaneProps.onCreateNote;
  useRevealMainWindow(!hasCompletedStartupReveal && !readyToRevealWindow);

  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey) return;

      const key = event.key.toLowerCase();
      switch (key) {
        case "n": {
          event.preventDefault();
          handleCreateNoteShortcut();
          break;
        }
        case "s": {
          event.preventDefault();
          setAccountSwitcherOpen((open) => !open);
          break;
        }
        case "o": {
          event.preventDefault();
          setCommandPaletteOpen((open) => !open);
          break;
        }
        case "f": {
          if (!event.shiftKey) break;
          event.preventDefault();
          window.dispatchEvent(new CustomEvent("comet:focus-search"));
          break;
        }
        case ",": {
          event.preventDefault();
          setSettingsOpen(true);
          break;
        }
        default: {
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCreateNoteShortcut, setSettingsOpen]);

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

  const chooseConflictActionVariant = chooseConflictDialogProps.deleteSelected
    ? "destructive"
    : "default";
  const chooseConflictActionLabel = chooseConflictDialogProps.deleteSelected
    ? "Delete note"
    : "Choose";
  const chooseConflictPendingLabel = chooseConflictDialogProps.deleteSelected
    ? "Deleting…"
    : "Choosing…";
  const chooseConflictDialogTitle = chooseConflictDialogProps.deleteSelected
    ? "Delete this note?"
    : "Choose this version?";
  const chooseConflictDialogDescription =
    chooseConflictDialogProps.deleteSelected
      ? "This will publish the deleted version currently shown and remove the note as the chosen resolution for this conflict."
      : "This will publish the version currently shown in the editor as the chosen resolution for this conflict.";

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
      <DialogRoot
        open={chooseConflictDialogProps.open}
        onOpenChange={chooseConflictDialogProps.onOpenChange}
      >
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup className="w-full max-w-sm p-6">
            <DialogTitle className="text-base font-semibold">
              {chooseConflictDialogTitle}
            </DialogTitle>
            <p className="text-muted-foreground mt-2 text-sm">
              {chooseConflictDialogDescription}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <DialogClose className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors">
                Cancel
              </DialogClose>
              <Button
                disabled={chooseConflictDialogProps.pending}
                onClick={chooseConflictDialogProps.onConfirm}
                size="sm"
                variant={chooseConflictActionVariant}
              >
                {chooseConflictDialogProps.pending
                  ? chooseConflictPendingLabel
                  : chooseConflictActionLabel}
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
