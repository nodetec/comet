import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NullString } from "&/database/sql/models";
import { Note } from "&/github.com/nodetec/captains-log/db/models";
import {
  NoteTagService,
  NotebookService,
  Tag,
  TagService,
} from "&/github.com/nodetec/captains-log/service";
import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";

import NoteTag from "./NoteTag";

type Props = {
  note: Note;
};

export default function TagInput({ note }: Props) {
  const { activeNotebook } = useAppState();
  const [tagName, setTagName] = useState<string>("");

  const queryClient = useQueryClient();

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTagName = e.target.value;
    setTagName(newTagName);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // check if tag already exists
      let noteTag: Tag | undefined;
      let isTagAssociatedWithNotebook = false;
      try {
        noteTag = await TagService.GetTagByName(tagName);
      } catch (_) {
        // if it doesn't, create it
        noteTag = await TagService.CreateTag(
          tagName,
          new NullString({ String: undefined, Valid: false }),
          new NullString({ String: undefined, Valid: false }),
          new Date().toISOString(),
        );
        void queryClient.invalidateQueries({ queryKey: ["tags"] });
      }
      // check if tag is associated with note
      const isTagAssociated = await NoteTagService.CheckTagForNote(
        note.ID,
        noteTag.ID,
      );
      // if it isn't, associate it with note
      if (!isTagAssociated) {
        await NoteTagService.AddTagToNote(note.ID, noteTag.ID);
        void queryClient.invalidateQueries({ queryKey: ["note_tags"] });
        setTagName("");
      }
      // check if tag is associated with notebook
      if(activeNotebook){
        isTagAssociatedWithNotebook = await NotebookService.CheckTagForNotebook(
          activeNotebook.ID,
          noteTag.ID,
        );
        // if it isn't, associate it with notebook
        if (!isTagAssociatedWithNotebook) {
          await NotebookService.AddTagToNotebook(activeNotebook.ID, noteTag.ID);
        }
      }
    }
  };

  async function fetchTags() {
    const note_tags = await NoteTagService.GetTagsForNote(note.ID);
    return note_tags;
  }

  const { data } = useQuery({
    queryKey: ["note_tags", note.ID, activeNotebook?.ID],
    staleTime: 50,
    queryFn: () => fetchTags(),
  });

  return (
    <div className="w-full border-t py-2 pl-4 pr-2">
      <div className="flex items-center gap-x-2">
        {data?.map((tag, tagIndex) => {
          return <NoteTag key={tagIndex} note={note} tag={tag} />;
        })}

        <Input
          type="text"
          className="min-w-12 max-w-full border-none px-1 text-xs focus-visible:ring-0"
          placeholder="Add Tags"
          onKeyDown={handleKeyDown}
          value={tagName}
          onChange={handleTagChange}
        />
      </div>
    </div>
  );
}
