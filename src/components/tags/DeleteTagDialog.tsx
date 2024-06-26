import { useQueryClient } from "@tanstack/react-query";
import { deleteTag } from "~/api";
import { useAppContext } from "~/store";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export default function DeleteTagDialog() {
  const {
    activeTag,
    setActiveTag,
    deleteTagDialog,
    setDeleteTagDialog,
    deleteTagDialogId,
    setDeleteTagDialogId,
    currentNote,
    setCurrentNote,
  } = useAppContext();

  const queryClient = useQueryClient();

  const deleteTagConfirm = async (id: number) => {
    await deleteTag(id);
    if (id === activeTag?.id) {
      setActiveTag(undefined);
    }
    const filteredTags = currentNote?.tags.filter((tag) => tag.id !== id);

    if (currentNote?.tags && filteredTags) {
      setCurrentNote({
        ...currentNote,
        tags: filteredTags,
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["tags"] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    setDeleteTagDialogId(undefined);
    setDeleteTagDialog(false);
  };

  return (
    <Dialog open={deleteTagDialog} onOpenChange={setDeleteTagDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. Are you sure you want to delete this
            tag?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (deleteTagDialogId) {
                await deleteTagConfirm(deleteTagDialogId);
              }
            }}
          >
            <Button type="submit">Confirm</Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
