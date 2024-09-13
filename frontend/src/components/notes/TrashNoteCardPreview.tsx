import { useEffect, useState } from "react";

import { Trash } from "&/github.com/nodetec/captains-log/db/models";
import { parseContent } from "~/lib/markdown";
import { useAppState } from "~/store";

type Props = {
  trashNote: Trash;
};

export default function TrashNoteCardPreview({ trashNote }: Props) {
  const noteSearch = useAppState((state) => state.noteSearch);
  const [parsedContent, setParsedContent] = useState("");

  useEffect(() => {
    const getParsedContent = async () => {
      const parsedContentResult =
        (await parseContent(trashNote.Content, noteSearch)) || "No content \n ";
      setParsedContent(parsedContentResult);
    };

    getParsedContent();
  }, [noteSearch]);

  return <div dangerouslySetInnerHTML={{ __html: parsedContent }}></div>;
}
