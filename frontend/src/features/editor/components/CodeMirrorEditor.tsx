import { useQueryClient } from "@tanstack/react-query";
import { Note } from "&/github.com/nodetec/comet/db/models";
import { NoteService } from "&/github.com/nodetec/comet/service";
import { useEditor } from "~/hooks/useEditor";
import { parseTitle } from "~/lib/markdown";
import { useAppState } from "~/store";
import { type InfiniteQueryData } from "~/types";

export const CodeMirrorEditor = () => {
  const activeNote = useAppState((state) => state.activeNote);
  const activeTrashNote = useAppState((state) => state.activeTrashNote);
  const feedType = useAppState((state) => state.feedType);
  const setActiveNote = useAppState((state) => state.setActiveNote);

  const editorFullScreen = useAppState((state) => state.editorFullScreen);

  const queryClient = useQueryClient();

  const onChange = async (doc: string) => {
    const data = queryClient.getQueryData(["notes"]) as InfiniteQueryData<Note>;
    if (!activeNote) return;
    setActiveNote({ ...activeNote, Content: doc });
    if (!data) return;
    if (!data.pages) return;
    // get all of the notes from the first page
    const notes = data.pages[0].data;
    // if there are no notes, return
    if (!notes) return;
    // get the first note
    const firstNote = notes[0];
    // if there is no first note, return
    if (!firstNote) return;
    // if the first note is the active note, return
    if (firstNote.ID === activeNote.ID) return;

    void NoteService.UpdateNote(
      activeNote.ID,
      parseTitle(doc),
      doc,
      activeNote.NotebookID,
      activeNote.StatusID,
      // TODO: rethink published indicator
      false,
      activeNote.EventID,

      activeNote.Pinned,
      activeNote.Notetype,
      activeNote.Filetype,
    );

    void queryClient.invalidateQueries({
      queryKey: ["notes"],
    });
  };

  const { editorRef } = useEditor({
    initialDoc:
      feedType === "trash"
        ? activeTrashNote?.Content || ""
        : activeNote?.Content || "",
    onChange,
  });

  return (
    <div className="flex h-full w-full overflow-y-auto">
      <div
        className={`prose prose-zinc h-full w-full max-w-none break-words pb-4 dark:prose-invert ${editorFullScreen && "py-4"}`}
        ref={editorRef}
      ></div>
    </div>
  );
};
