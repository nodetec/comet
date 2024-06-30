import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NullString } from "&/database/sql/models";
import {
  NoteTagService,
  TagService,
} from "&/github.com/nodetec/captains-log/service";
import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";

import NoteTag from "./NoteTag";

export default function TagInput() {
  const [tagName, setTagName] = useState<string>("");
  const { activeNote } = useAppState();

  const queryClient = useQueryClient();

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTagName = e.target.value;
    setTagName(newTagName);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!activeNote) return;

      // check if tag already exists
      let noteTag = await TagService.GetTagByName(tagName);
      console.log(noteTag);
      // if it doesn't, create it
      if (!noteTag) {
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
        activeNote.ID,
        noteTag.ID,
      );
      // if it isn't, associate it with note
      if (!isTagAssociated) {
        await NoteTagService.AddTagToNote(activeNote.ID, noteTag.ID);
        void queryClient.invalidateQueries({ queryKey: ["note_tags"] });
        setTagName("");
      }
    }
  };

  const { data } = useQuery({
    queryKey: ["note_tags"],
    queryFn: () => fetchTags(),
  });

  async function fetchTags() {
    if (!activeNote) return;
    const note_tags = await NoteTagService.GetTagsForNote(activeNote.ID);
    return note_tags;
  }

  return (
    <div className="w-full border-t py-2 pl-4 pr-2">
      <div className="flex items-center gap-x-2">
        {data?.map((tag, tagIndex) => {
          return <NoteTag key={tagIndex} tag={tag} />;
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
