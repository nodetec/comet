import { useEffect, useState } from "react";

import { Note } from "&/github.com/nodetec/captains-log/db/models";
import { parseContent } from "~/lib/markdown";
import { useAppState } from "~/store";

type Props = {
  note: Note;
};

export default function NoteCardPreview({ note }: Props) {
  const noteSearch = useAppState((state) => state.noteSearch);
  const [parsedContent, setParsedContent] = useState("");

  useEffect(() => {
    const getParsedContent = async () => {
      const parsedContentResult =
        (await parseContent(note.Content, noteSearch)) || "No content \n ";
      setParsedContent(parsedContentResult);
    };

    getParsedContent();
  }, [noteSearch]);

  return <div dangerouslySetInnerHTML={{ __html: parsedContent }}></div>;
}
