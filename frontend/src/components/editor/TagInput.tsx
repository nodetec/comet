import { useState } from "react";

// import { useQueryClient } from "@tanstack/react-query";
import { Input } from "~/components/ui/input";

export default function TagInput() {
  const [tagName, setTagName] = useState<string>("");

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTagName = e.target.value;
    setTagName(newTagName);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevents the default action of the Enter key if needed
    }
  };

  return (
    <div className="w-full pl-4 pr-2 border-t py-2">
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
