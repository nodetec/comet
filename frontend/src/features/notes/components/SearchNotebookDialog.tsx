import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  NotebookService,
  NoteService,
} from "&/github.com/nodetec/comet/service";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";

const SearchNotebookDialog = () => {
  async function fetchNotebooks() {
    const notebooks = await NotebookService.ListNotebooks();
    return notebooks;
  }
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notebooks"],
    queryFn: () => fetchNotebooks(),
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [filteredNotebooks, setFilteredNotebooks] = useState(data);
  const isSelectNotebookDialogOpen = useAppState(
    (state) => state.isSelectNotebookDialogOpen,
  );
  const setIsSelectNotebookDialogOpen = useAppState(
    (state) => state.setIsSelectNotebookDialogOpen,
  );
  const selectedNote = useAppState((state) => state.selectedNote);

  const setSelectedNote = useAppState((state) => state.setSelectedNote);

  const handleSearch = (event) => {
    const query = event.target.value.toLowerCase();
    setSearchTerm(query);
    //TODO: Filter out active notebook from list and maybe add ability to remove from notebook
    setFilteredNotebooks(
      data?.filter((notebook) => notebook.Name.toLowerCase().startsWith(query)),
    );
  };

  const moveToNotebook = async (notebookId) => {
    if (!selectedNote) return;

    void (await NoteService.UpdateNote(
      selectedNote.ID,
      selectedNote.Title,
      selectedNote.Content,
      notebookId,
      selectedNote.StatusID,
      false,
      selectedNote.EventID,

      selectedNote.Pinned,
      selectedNote.Notetype,
      selectedNote.Filetype,
    ));
    void queryClient.invalidateQueries({
      queryKey: ["notes"],
    });

    handleMoveToNotebookDialogClose();
  };

  const handleMoveToNotebookDialogClose = () => {
    setSelectedNote(undefined);
    setIsSelectNotebookDialogOpen(false);
  };

  return (
    <Dialog
      open={isSelectNotebookDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          handleMoveToNotebookDialogClose();
        } else {
          setIsSelectNotebookDialogOpen(true);
        }
      }}
    >
      <DialogContent className="mx-auto my-auto flex max-h-[70%] min-h-[70%] min-w-[50%] max-w-[50%] flex-col items-start justify-start border border-accent p-4">
        <DialogHeader className="w-full">
          <DialogTitle className="text-primary">Move to Notebook</DialogTitle>
        </DialogHeader>
        <div className="sticky top-0 w-full">
          <Input
            placeholder="Search Notebooks..."
            value={searchTerm}
            onChange={handleSearch}
            className="w-full"
          />
        </div>
        <div className="min-h-full w-full overflow-y-auto">
          <ul className="w-full space-y-2">
            {filteredNotebooks?.length ? (
              filteredNotebooks.map((notebook) => (
                <li
                  key={notebook.ID}
                  className="cursor-pointer rounded-md p-1 text-primary hover:bg-muted/70"
                  onClick={() => moveToNotebook(notebook.ID)}
                >
                  {notebook.Name}
                </li>
              ))
            ) : (
              <li className="text-gray-500">No notebooks found</li>
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchNotebookDialog;
