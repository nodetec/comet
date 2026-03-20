import { useState, useEffect } from "react";
import { FileText, Loader2 } from "lucide-react";
import { useNostr } from "~/lib/nostr/use-nostr";
import { useNotes } from "~/lib/nostr/use-notes";
import { NoteList } from "~/components/dashboard/note-list";
import { NoteDetail } from "~/components/dashboard/note-detail";

export function NotesPage() {
  const { isAuthenticated } = useNostr();
  const { notes, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useNotes();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const selectedNote = notes.find((n) => n.id === selectedNoteId) ?? null;

  // Auto-select first note when notes load
  useEffect(() => {
    if (notes.length > 0 && !selectedNoteId) {
      setSelectedNoteId(notes[0].id);
    }
  }, [notes, selectedNoteId]);

  // If the selected note was removed, fall back
  useEffect(() => {
    if (selectedNoteId && !notes.find((n) => n.id === selectedNoteId)) {
      setSelectedNoteId(notes.length > 0 ? notes[0].id : null);
    }
  }, [notes, selectedNoteId]);

  if (!isAuthenticated && !isLoading) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p className="text-sm">Connecting to relay...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left pane: note list */}
      <NoteList
        notes={notes}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
        selectedNoteId={selectedNoteId}
        onSelectNote={setSelectedNoteId}
      />

      {/* Right pane: note detail */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selectedNote ? (
          <NoteDetail note={selectedNote} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="bg-muted mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <FileText className="text-muted-foreground h-6 w-6" />
              </div>
              <h3 className="text-sm font-medium">No note selected</h3>
              <p className="text-muted-foreground mt-1 text-xs">
                Choose a note from the sidebar to start reading
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
