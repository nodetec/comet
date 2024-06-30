import { useState } from "react";

import { NullString } from "&/database/sql/models";
import { TagService } from "&/github.com/nodetec/captains-log/service";
import { Input } from "~/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";

export default function TagInput() {
  const [tagName, setTagName] = useState<string>("");

  const queryClient = useQueryClient();

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTagName = e.target.value;
    setTagName(newTagName);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await TagService.CreateTag(
        tagName,
        new NullString({ String: undefined, Valid: false }),
        new NullString({ String: undefined, Valid: false }),
        new Date().toISOString(),
      );
      setTagName("");
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    }
  };

  return (
    <div className="w-full border-t py-2 pl-4 pr-2">
      <div className="flex items-center gap-x-2">
        {/* {currentNote?.tags?.map((tag, tagIndex) => { */}
        {/*   return <NoteTag key={tagIndex} tag={tag} />; */}
        {/* })} */}

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
