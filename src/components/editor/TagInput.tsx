import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { createTag, getTag, tagNote } from "~/api";
import { Input } from "~/components/ui/input";
import { useAppContext } from "~/store";

import { Badge } from "../ui/badge";

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
      if (noteId === undefined) {
        return;
      }

      const getTagResponse = await getTag({ name: tagName });
      const existingTag = getTagResponse.data;

      if (getTagResponse.error) {
        const createTagResponse = await createTag({
          name: tagName,
          color: "",
          icon: "",
          noteId,
        });
        console.log(createTagResponse);
        if (createTagResponse.data && currentNote) {
          currentNote.tags.push(createTagResponse.data);
          setCurrentNote(currentNote);
        }
        if (createTagResponse.error) {
          return;
        }
      }

      if (existingTag) {
        // if exists, tag note
        await tagNote({ noteId, tagId: existingTag.id });
        if (currentNote) {
          currentNote.tags.push(existingTag);
          setCurrentNote(currentNote);
        }
      }
      setTagName("");
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    }
  };

  return (
    <div className="w-full px-2 py-2">
      <div className="flex gap-x-2">
        {currentNote?.tags &&
          currentNote?.tags.map((tag, tagIndex) => {
            return (
              <Badge
                key={tagIndex}
                className="cursor-default select-none rounded-full"
                variant="secondary"
              >
                {tag.name}
              </Badge>
            );
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
