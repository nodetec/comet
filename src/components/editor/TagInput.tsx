import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { tagNote } from "~/api";
import { Input } from "~/components/ui/input";
import { useGlobalState } from "~/store";

export default function TagInput() {
  const [tag, setTag] = useState<string>("");

  const { setActiveNote, activeNote } = useGlobalState();
  const queryClient = useQueryClient();

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tag = e.target.value;
    setTag(tag);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const noteId = activeNote?.id;
      if (noteId === undefined) {
        return;
      }

      // TODO:

      // check if tag exists

      // if not, create tag

      // tag note

      await tagNote({ noteId, tagId });

      e.preventDefault(); // Prevents the default action of the Enter key if needed
    }
  };

  return (
    <Input
      type="text"
      className="border-none px-1 text-xs focus-visible:ring-0"
      placeholder="Add Tags"
      onKeyDown={handleKeyDown}
      onChange={handleTagChange}
    />
  );
}
