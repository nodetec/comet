import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { createTag, getTag, tagNote } from "~/api";
import { Input } from "~/components/ui/input";
import { useGlobalState } from "~/store";

export default function TagInput() {
  const [tagName, setTagName] = useState<string>("");

  const { activeNote } = useGlobalState();
  const queryClient = useQueryClient();

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTagName = e.target.value;
    setTagName(newTagName);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevents the default action of the Enter key if needed
      const noteId = activeNote?.id;
      if (noteId === undefined) {
        return;
      }

      const getTagResponse = await getTag({ name: tagName });
      const existingTag = getTagResponse.data;

      console.log("Get Tag Response", getTagResponse);

      if (!getTagResponse.success) {
        console.log("Creating tag");
        const createTagResponse = await createTag({
          name: tagName,
          color: "",
          icon: "",
          associatedNote: noteId,
        });
        if (!createTagResponse.success) {
          return;
        }
      }

      if (existingTag) {
        // if exists, tag note
        await tagNote({ noteId, tagId: existingTag.id });
        console.log("Tagged note");
      }
      setTagName("");
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    }
  };

  return (
    <div className="px-2 py-2 w-full">
      <Input
        type="text"
        className="min-w-12 max-w-28 border-none px-1 text-xs focus-visible:ring-0"
        placeholder="Add Tags"
        onKeyDown={handleKeyDown}
        value={tagName}
        onChange={handleTagChange}
      />
    </div>
  );
}
