import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Events } from "@wailsio/runtime";
import { WailsEvent } from "@wailsio/runtime/types/events";
import { useAppState } from "~/store";

const useNoteMenu = () => {
  const queryClient = useQueryClient();

  const activeNote = useAppState((state) => state.activeNote);
  const setActiveNote = useAppState((state) => state.setActiveNote);
  const setIsSelectNotebookDialogOpen = useAppState(
    (state) => state.setIsSelectNotebookDialogOpen,
  );
  const setSelectedNote = useAppState((state) => state.setSelectedNote);
  useEffect(() => {
    const handleNoteDeleted = (event: WailsEvent) => {
      if (activeNote?.ID === event.data) {
        console.log("setting active note to undefined");
        // TODO: set active note to the next note in the list if it exists
        setActiveNote(undefined);
      }
      void queryClient.invalidateQueries({
        queryKey: ["notes"],
      });
    };

    const handleMoveToNotebook = (event: WailsEvent) => {
      setSelectedNote(event.data[0]);
      setIsSelectNotebookDialogOpen(true);
    };

    Events.On("noteDeleted", handleNoteDeleted);
    Events.On("noteBookModal", handleMoveToNotebook);

    return () => {
      Events.Off("noteDeleted");
      Events.Off("noteBookModal");
    };
  }, [activeNote, setActiveNote, queryClient]);
};

export default useNoteMenu;
