import { useState } from "react";

import { useAppState } from "~/store";
import {
  EllipsisVertical,
  Eye,
  PinIcon,
} from "lucide-react";

import { Button } from "../ui/button";
import { PostButton } from "./PostButton";

export function EditorHeader() {
  const { activeNote } = useAppState();


  return (
    <div className="flex flex-col px-2 pt-3">
      <div className="flex items-center justify-end gap-x-3">

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
