import { useQueryClient } from "@tanstack/react-query";
import { Note } from "&/github.com/nodetec/captains-log/db/models";
import { NoteService } from "&/github.com/nodetec/captains-log/service";
import { useEditor } from "~/hooks/useEditor";
import { useAppState } from "~/store";
import { type InfiniteQueryData } from "~/types";

import ReadOnlyTagList from "./ReadOnlyTagList";
import TagInput from "./TagInput";

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

    void (await NoteService.UpdateNote({
      ...activeNote,
      ModifiedAt: new Date().toISOString(),
      Content: doc,
    }));

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

  if (activeNote === undefined && (feedType === "all" || feedType === "tag")) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-lg text-muted-foreground">
          Create a note to get started.
        </p>
      </div>
    );
  }

  if (activeTrashNote === undefined && feedType === "trash") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-lg text-muted-foreground">No notes in the trash.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col pt-11">
      <div className="h-full overflow-auto">
        <div className="h-full w-full px-4" ref={editorRef}></div>
      </div>
      <div className="flex items-center justify-between">
        {feedType === "trash"
          ? activeTrashNote && <ReadOnlyTagList trashNote={activeTrashNote} />
          : activeNote && <TagInput note={activeNote} />}
      </div>
    </div>
  );
};

export default Editor;
