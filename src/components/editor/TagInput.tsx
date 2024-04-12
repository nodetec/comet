import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { createTag, getTag, tagNote } from "~/api";
import { Input } from "~/components/ui/input";
import { useGlobalState } from "~/store";

export default function TagInput() {
  const [tagName, setTagName] = useState<string>("");

  const { activeNote } = useGlobalState();

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

      const response = await getTag({ name: tagName });

      console.log("Response", response);

      if (!response.success) {
        console.log("Creating tag");
        const response = await createTag({
          name: tagName,
          color: "",
          icon: "",
        });
        if (!response.success) {
          return;
        }
        if (response.data) {
          await tagNote({ noteId, tagId: response.data.id });
          console.log("Tagged note");
        }
      }

      const existingTag = response.data;

      if (existingTag) {
        // if exists, tag note
        await tagNote({ noteId, tagId: existingTag.id });
        console.log("Tagged note");
      }
      setTagName("");
    }
  };

  return (
    <Input
      type="text"
      className="border-none px-1 text-xs focus-visible:ring-0"
      placeholder="Add Tags"
      onKeyDown={handleKeyDown}
      value={tagName}
      onChange={handleTagChange}
    />
  );
}
