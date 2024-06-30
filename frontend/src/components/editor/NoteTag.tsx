import { Tag } from "&/github.com/nodetec/captains-log/service";
import { useAppState } from "~/store";

import { Badge } from "../ui/badge";

type Props = {
  tag: Tag;
};

export default function NoteTag({ tag }: Props) {
  const { activeNote } = useAppState();

  const handleContextMenu = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault(); // prevent the default behaviour when right clicked
    // const tagId = tag.ID;
    const noteId = activeNote?.ID;
    if (noteId) {
      // TODO: Implement tag removal context menu
    }
  };

  return (
    <div onContextMenu={handleContextMenu}>
      <Badge
        className="cursor-default select-none rounded-full"
        variant="secondary"
      >
        {tag.Name}
      </Badge>
    </div>
  );
}
