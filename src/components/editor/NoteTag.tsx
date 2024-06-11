import { createContextMenu } from "~/api";
import { useAppContext } from "~/store";
import { type Tag } from "~/types";
import {
  type CreateContextMenuRequest,
  type NoteTagItemContextMenuRequest,
} from "~/types/contextMenuTypes";

import { Badge } from "../ui/badge";

type Props = {
  tag: Tag;
};

export default function NoteTag({ tag }: Props) {
  const { currentNote } = useAppContext();

  const handleContextMenu = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault(); // prevent the default behaviour when right clicked
    const tagId = tag.id;
    const noteId = currentNote?.id;
    console.log("currentNote", currentNote);
    if (noteId) {
      const menuKind: NoteTagItemContextMenuRequest = {
        NoteTag: {
          noteId,
          tagId,
        },
      };
      const notTagItemRequest: CreateContextMenuRequest = {
        menuKind,
      };
      await createContextMenu(notTagItemRequest);
    }
  };

  return (
    <div onContextMenu={handleContextMenu}>
      <Badge
        className="cursor-default select-none rounded-full"
        variant="secondary"
      >
        {tag.name}
      </Badge>
    </div>
  );
}
