import { useState } from "react";

import { Button } from "~/components/ui/button";
import { useAppState } from "~/store";
import { Eye } from "lucide-react";

import Editor from "./Editor";
import Preview from "./Preview";
import ReadOnlyTagList from "./ReadOnlyTagList";
import TagInput from "./TagInput";

export const EditorWrapper = () => {
  const { activeNote, activeTrashNote, feedType } = useAppState();
  const [showPreview, setShowPreview] = useState(false);

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
    <div className="flex h-full flex-col pt-10">
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
          : activeNote && <TagInput note={activeNote} />}
      </div>
    </div>
  );
};

export default EditorWrapper;
