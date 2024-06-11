import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { createTag, getTag, tagNote } from "~/api";
import { Input } from "~/components/ui/input";
import { useAppContext } from "~/store";

import NoteTag from "./NoteTag";

export default function TagInput() {
  const [tagName, setTagName] = useState<string>("");

  const { currentNote, setCurrentNote, filter } = useAppContext();
  const queryClient = useQueryClient();

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTagName = e.target.value;
    setTagName(newTagName);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevents the default action of the Enter key if needed
      const noteId = currentNote?.id;

      if (noteId === undefined) return;

      if (currentNote?.tags.some(tag => tag.name === tagName)) return;

      const getTagResponse = await getTag({ name: tagName });
      const existingTag = getTagResponse.data;
      if (getTagResponse.error) {
        const createTagResponse = await createTag({
          name: tagName,
          color: "",
          icon: "",
          noteId,
        });
        if (createTagResponse.data && currentNote) {
          setCurrentNote({
            ...currentNote,
            tags: [...currentNote.tags, createTagResponse.data],
          });
        }
        if (createTagResponse.error) {
          return;
        }
      }

      if (existingTag) {
        // if exists, tag note
        await tagNote({ noteId, tagId: existingTag.id });

        if (!currentNote) return;

        if (currentNote?.tags) {
          setCurrentNote({
            ...currentNote,
            tags: [...currentNote.tags, existingTag],
          });
        } else {
          setCurrentNote({ ...currentNote, tags: [existingTag] });
        }
      }
      setTagName("");
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    }
  };

  return (
    <div className="w-full px-2">
      <div className="flex items-center gap-x-2">
        {currentNote?.tags?.map((tag, tagIndex) => {
          return <NoteTag key={tagIndex} tag={tag} />;
        })}

        {filter !== "trashed" && filter !== "archived" && (
          <Input
            type="text"
            className="min-w-12 max-w-full border-none px-1 text-xs focus-visible:ring-0"
            placeholder="Add Tags"
            onKeyDown={handleKeyDown}
            value={tagName}
            onChange={handleTagChange}
          />
        )}
      </div>
    </div>
  );
}
