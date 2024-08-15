import { useAppState } from "~/store";
import { ChevronLeft, EllipsisVertical, Menu, PinIcon } from "lucide-react";

import { Button } from "../ui/button";
import { PostButton } from "./PostButton";

export function EditorHeader() {
  const activeNote = useAppState((state) => state.activeNote);
  const editorFullScreen = useAppState((state) => state.editorFullScreen);
  const setEditorFullScreen = useAppState((state) => state.setEditorFullScreen);

  return (
    <div className="flex flex-col px-2 pt-2.5">
      <div className="flex items-center justify-between gap-x-3">
        {editorFullScreen ? (
          <Button
            id="editor-preview-btn"
            name="editor-preview-btn"
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground ml-20 hover:bg-background"
            onClick={() => setEditorFullScreen(false)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            id="editor-preview-btn"
            name="editor-preview-btn"
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-background"
            onClick={() => setEditorFullScreen(true)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        <div className="flex gap-x-2">
          <Button
            id="editor-preview-btn"
            name="editor-preview-btn"
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-background"
          >
            <PinIcon className="h-5 w-5" />
          </Button>
          <PostButton note={activeNote} />
          <Button
            id="editor-preview-btn"
            name="editor-preview-btn"
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-background"
          >
            <EllipsisVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* <div className="flex items-center justify-between"> */}
      {/*   {feedType === "trash" */}
      {/*     ? activeTrashNote && <ReadOnlyTagList trashNote={activeTrashNote} /> */}
      {/*     : data && activeNote && <TagInput note={activeNote} tags={data} />} */}
      {/* </div> */}
    </div>
  );
}
