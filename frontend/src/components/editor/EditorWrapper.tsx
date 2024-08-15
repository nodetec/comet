import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { TagService } from "&/github.com/nodetec/captains-log/service";
import { Button } from "~/components/ui/button";
import { useAppState } from "~/store";
import { Eye } from "lucide-react";

import Editor from "./Editor";
import { EditorHeader } from "./EditorHeader";
import Preview from "./Preview";
import ReadOnlyTagList from "./ReadOnlyTagList";
import TagInput from "./TagInput";

export const EditorWrapper = () => {
  const [showPreview, setShowPreview] = useState(false);

  const feedType = useAppState((state) => state.feedType);
  const activeNote = useAppState((state) => state.activeNote);
  const activeTrashNote = useAppState((state) => state.activeTrashNote);

  // TODO
  // Where should the errors and loading be taken care of?
  async function fetchTags() {
    const tags = await TagService.ListTags();
    return tags;
  }

  const { data } = useQuery({
    queryKey: ["tags"],
    queryFn: () => fetchTags(),
  });

  if (
    activeNote === undefined &&
    (feedType === "all" || feedType === "notebook")
  ) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-lg text-muted-foreground">
          Something about notes...
        </p>
      </div>
    );
  }

  if (activeTrashNote === undefined && feedType === "trash") {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      <EditorHeader />
      {!showPreview && <Editor />}
      {showPreview && <Preview />}
      <div className="fixed bottom-[3.75rem] right-2.5 p-2">
        <Button
          id="editor-preview-btn"
          name="editor-preview-btn"
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setShowPreview((prevShowPreview) => !prevShowPreview)}
          className="rounded-full text-muted-foreground"
        >
          <Eye className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </div>
      <div className="flex items-center justify-between">
        {feedType === "trash"
          ? activeTrashNote && <ReadOnlyTagList trashNote={activeTrashNote} />
          : data && activeNote && <TagInput note={activeNote} tags={data} />}
      </div>
    </div>
  );
};

export default EditorWrapper;
