import { useQueryClient } from "@tanstack/react-query";
import { createContextMenu, deleteTag } from "~/api";
import { useAppContext } from "~/store";
import { type Tag } from "~/types";
import {
  type CreateContextMenuRequest,
  type TagItemContextMenuRequest,
} from "~/types/contextMenuTypes";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

type Props = {
  tag: Tag;
};

export default function TagItem({ tag }: Props) {
  const {
    activeTag,
    setFilter,
    setActiveTag,
    setCurrentTrashedNote,
    confirmTagDelete,
    setConfirmTagDelete,
    currentNote,
    setCurrentNote,
  } = useAppContext();

  const queryClient = useQueryClient();

  const handleSetActiveTag = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();

    setFilter("all");
    setActiveTag(tag);
    setCurrentTrashedNote(undefined);
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  const handleContextMenu = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault(); // prevent the default behaviour when right clicked
    const id = tag.id;
    const menuKind: TagItemContextMenuRequest = {
      TagItem: {
        id,
      },
    };
    const tagItemRequest: CreateContextMenuRequest = {
      menuKind,
    };
    await createContextMenu(tagItemRequest);
  };

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

    setConfirmTagDelete(false);
  };

  return (
    <>
      <Dialog open={confirmTagDelete} onOpenChange={setConfirmTagDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you absolutely sure?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Are you sure you want to permanently
              delete this tag?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                await deleteTagConfirm(tag.id);
              }}
            >
              <Button type="submit">Confirm</Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div
        onContextMenu={handleContextMenu}
        onClick={handleSetActiveTag}
        key={tag.id}
        className={`flex h-full w-full cursor-pointer select-none flex-col rounded-md px-4 py-2 text-sm font-medium ${tag.name === activeTag?.name && "bg-muted/80"}`}
      >
        <span
          className={`select-none text-muted-foreground ${tag.name === activeTag?.name && "text-secondary-foreground"}`}
        >
          {tag.name}
        </span>
      </div>
    </>
  );
}
