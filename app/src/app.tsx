import type { CSSProperties } from "react";

import { useTheme } from "@/shared/hooks/use-theme";
import { Bar, Container, Section } from "@column-resizer/react";

import { Toaster } from "@/shared/ui/sonner";
import { AccountSwitcherDialog } from "@/features/settings/account-switcher-dialog";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { CommandPalette } from "@/features/command-palette";
import { BootstrapError } from "@/features/shell/ui/bootstrap-error";
import { ConflictResolutionDialog } from "@/features/shell/ui/conflict-resolution-dialog";
import { DeletePublishDialog } from "@/features/shell/ui/delete-publish-dialog";
import { EditorPane } from "@/features/shell/editor-pane";
import { NoteHistoryDialog } from "@/features/shell/note-history-dialog";
import { NotesPane } from "@/features/notes/ui/notes-pane";
import { PublishDialog, PublishShortNoteDialog } from "@/features/publishing";
import { SidebarPane } from "@/features/shell/sidebar-pane";
import { useAppShortcuts } from "@/features/shell/use-app-shortcuts";
import { useRevealMainWindow } from "@/features/shell/use-reveal-main-window";
import { useShellController } from "@/features/shell/use-shell-controller";
import { useUIStore } from "@/features/settings/store/use-ui-store";

const IS_MACOS = navigator.userAgent.includes("Mac");

function App() {
  useTheme();
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

  const revealed = useRevealMainWindow(readyToRevealWindow);

  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const notesPanelVisible = useUIStore((s) => s.notesPanelVisible);

  if (!revealed) return null;

  if (bootstrapError) {
    return <BootstrapError error={bootstrapError} onRetry={retryBootstrap} />;
  }

  return (
    <div
      className="text-foreground relative h-full min-h-0 overflow-hidden"
      style={
        {
          "--titlebar-height": IS_MACOS ? "3.25rem" : "0px",
        } as CSSProperties
      }
    >
      <div className="relative h-full min-h-0">
        {IS_MACOS ? (
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
      <ConflictResolutionDialog {...chooseConflictDialogProps} />
      <DeletePublishDialog {...deletePublishDialogProps} />
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
