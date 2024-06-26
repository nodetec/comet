import { useState } from "react";

import { Button } from "~/components/ui/button";
import { useAppContext } from "~/store";
import { Eye } from "lucide-react";

import Editor from "./Editor";
import EditorControls from "./EditorControls";
import Preview from "./Preview";
import TagInput from "./TagInput";

export const EditorWrapper = () => {
  const { currentNote, currentTrashedNote } = useAppContext();
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      {(currentNote ?? currentTrashedNote) && (
        <div className="flex h-full flex-col">
          {!showPreview && <Editor />}
          {showPreview && <Preview />}
          <div className="fixed bottom-[3.75rem] right-2.5 p-2">
            <Button
              id="editor-preview-btn"
              name="editor-preview-btn"
              type="button"
              variant="ghost"
              size="icon"
              onClick={() =>
                setShowPreview((prevShowPreview) => !prevShowPreview)
              }
              className="rounded-full text-muted-foreground"
            >
              <Eye className="h-[1.2rem] w-[1.2rem]" />
            </Button>
          </div>
          <div className="flex items-center border-t border-muted">
            <TagInput />
            <EditorControls />
          </div>
        </div>
      )}
    </>
  );
};

export default EditorWrapper;
