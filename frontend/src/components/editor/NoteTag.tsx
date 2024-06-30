import { useEffect } from "react";

import { Note } from "&/github.com/nodetec/captains-log/db/models";
import { Tag } from "&/github.com/nodetec/captains-log/service";

import { Badge } from "../ui/badge";

type Props = {
  tag: Tag;
  note: Note;
};

export default function NoteTag({ tag, note }: Props) {
  useEffect(() => {
    console.log(`TAG ID: ${tag.ID}`);
    console.log(`NOTE ID: ${note.ID}`);
  }, [tag, note]);

  return (
    <div>
      <Badge
        style={
          {
            "--custom-contextmenu": "noteTagMenu",
            "--custom-contextmenu-data": `${note.ID}:${tag.ID}`,
          } as React.CSSProperties
        }
        className="cursor-default select-none whitespace-nowrap rounded-full"
        variant="secondary"
      >
        {tag.Name}
      </Badge>
    </div>
  );
}
