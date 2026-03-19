import { type CSSProperties, useEffect, useState } from "react";

import { useTheme } from "@/hooks/use-theme";
import { Bar, Container, Section } from "@column-resizer/react";

import { Button } from "@/components/ui/button";
import {
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { CommandPalette } from "@/features/shell/command-palette";
import { EditorPane } from "@/features/shell/editor-pane";
import { NotesPane } from "@/features/shell/notes-pane";
import {
  PublishDialog,
  PublishShortNoteDialog,
} from "@/features/shell/publish-dialog";
import { SidebarPane } from "@/features/shell/sidebar-pane";
import { useRevealMainWindow } from "@/features/shell/use-reveal-main-window";
import { useShellController } from "@/features/shell/use-shell-controller";

function App() {
  useTheme();
  const [isMacos] = useState(() => navigator.userAgent.includes("Mac"));
  const [hasCompletedStartupReveal, setHasCompletedStartupReveal] =
    useState(false);
  const {
    bootstrapError,
    deletePublishDialogProps,
    editorPaneProps,
    notesPaneProps,
    publishDialogProps,
    publishShortNoteDialogProps,
    readyToRevealWindow,
    retryBootstrap,
    sidebarPaneProps,
  } = useShellController();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  useRevealMainWindow(!hasCompletedStartupReveal && !readyToRevealWindow);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;

      if (event.key === "o") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      } else if (event.key === "k") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("comet:focus-search"));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
            className="bg-divider z-30 cursor-col-resize"
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
        availableTags={sidebarPaneProps.availableTags}
        notebooks={notesPaneProps.notebooks}
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onSelectNote={notesPaneProps.onSelectNote}
        onSelectNotebook={sidebarPaneProps.onSelectNotebook}
        onToggleTag={sidebarPaneProps.onToggleTag}
      />
      <SettingsDialog />
      <Toaster closeButton position="bottom-right" richColors />
    </div>
  );
}

export default App;
