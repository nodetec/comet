import { useQueryClient } from "@tanstack/react-query";
import { Note } from "&/github.com/nodetec/captains-log/db/models";
import { NoteService } from "&/github.com/nodetec/captains-log/service";
import { useEditor } from "~/hooks/useEditor";
import { parseTitle } from "~/lib/markdown";
import { useAppState } from "~/store";
import { type InfiniteQueryData } from "~/types";

const Editor = () => {
  const { activeNote, setActiveNote, activeTrashNote, feedType } =
    useAppState();

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
    <div className="h-full w-full overflow-auto" ref={editorRef}></div>
  );
};

export default Editor;
