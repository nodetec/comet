import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { updateNote } from "~/api";
import { useCM6Editor } from "~/hooks/useCM6Editor";
import { useAppContext } from "~/store";

import EditorControls from "./EditorControls";
import TagInput from "./TagInput";

export const Editor = () => {
  const { currentNote, setCurrentNote, currentTrashedNote } = useAppContext();

  const queryClient = useQueryClient();
  const data = queryClient.getQueryData(["notes", { search: false }]);

  const onChange = (doc: string) => {
    console.log("hello");
    if (!currentNote) return;
    currentNote.content = doc;
    setCurrentNote(currentNote);
    // @ts-ignore
    const notes = data.pages[0].data;

    const firstNote = notes[0];

    console.log("firstNote", firstNote);
    //
    if (!firstNote) return;
    //
    if (firstNote.id !== currentNote?.id) {
      console.log("firstNote.id", firstNote.id);

      updateNote({ id: currentNote.id, content: doc });

      void queryClient.invalidateQueries({
        queryKey: [
          "notes",
          {
            search: false,
          },
        ],
      });
    }
  };

  const { editorRef, editorView } = useCM6Editor({
    initialDoc: currentNote?.content || currentTrashedNote?.content || "",
    onChange,
  });

  useEffect(() => {
    //   if (!editor.current) return;
    //   const currentEditor = editor.current;
    //   currentEditor.
  }, [currentNote, currentTrashedNote]);

  return (
    <>
      {(currentNote || currentTrashedNote) && (
        <div className="flex h-full flex-col">
          <div
            className="editor-container h-full w-full overflow-y-auto"
            ref={editorRef}
          />
          <div className="flex items-center border-t border-muted">
            <TagInput />
            <EditorControls />
          </div>
        </div>
      )}
    </>
  );
};

export default Editor;
