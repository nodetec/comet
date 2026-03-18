import { useCallback, useState, type CSSProperties } from "react";

import { useTheme } from "@/hooks/use-theme";
import { Toaster } from "@/components/ui/sonner";
import { useShellController } from "@/features/shell/use-shell-controller";
import { Button } from "@/components/ui/button";

import { MobileSidebar } from "./mobile-sidebar";
import { MobileNotesList } from "./mobile-notes-list";
import { MobileEditor } from "./mobile-editor";

type MobileView = "sidebar" | "notes" | "editor";

function MobileApp() {
  useTheme();
  const {
    bootstrapError,
    editorPaneProps,
    notesPaneProps,
    retryBootstrap,
    sidebarPaneProps,
  } = useShellController();

  const [view, setView] = useState<MobileView>("notes");
  // When a note is selected, navigate to editor
  const handleSelectNote = useCallback(
    (noteId: string) => {
      notesPaneProps.onSelectNote(noteId);
      setView("editor");
    },
    [notesPaneProps.onSelectNote],
  );

  // When a filter/notebook/tag is selected in sidebar, go to notes list
  const handleSidebarNavigate = useCallback(() => {
    setView("notes");
  }, []);

  if (bootstrapError) {
    return (
      <div className="text-foreground flex min-h-screen items-center justify-center p-6">
        <div className="border-border bg-card flex w-full max-w-sm flex-col gap-4 rounded-xl border px-5 py-5 shadow-sm">
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
          "--safe-area-top": "env(safe-area-inset-top)",
          "--safe-area-bottom": "env(safe-area-inset-bottom)",
        } as CSSProperties
      }
    >
      <div className="relative flex h-full min-h-0 flex-col">
        {view === "sidebar" && (
          <MobileSidebar
            {...sidebarPaneProps}
            onNavigateToNotes={handleSidebarNavigate}
            onClose={() => setView("notes")}
          />
        )}

        {view === "notes" && (
          <MobileNotesList
            {...notesPaneProps}
            onSelectNote={handleSelectNote}
            onOpenSidebar={() => setView("sidebar")}
          />
        )}

        {view === "editor" && (
          <MobileEditor
            {...editorPaneProps}
            onBack={() => setView("notes")}
          />
        )}
      </div>
      <Toaster closeButton position="top-center" richColors />
    </div>
  );
}

export default MobileApp;
