import { useAppState } from "~/store";
import { EllipsisVertical, PinIcon } from "lucide-react";

import { Button } from "../ui/button";
import { PostButton } from "./PostButton";

export function EditorHeader() {
  const activeNote = useAppState((state) => state.activeNote);
  const editorFullScreen = useAppState((state) => state.editorFullScreen);
  const setEditorFullScreen = useAppState((state) => state.setEditorFullScreen);

  return (
    <div
      className={`flex flex-col px-2 pt-3 ${editorFullScreen && "border-b pb-3"}`}
    >
      <div className="flex items-center justify-between gap-x-3">
        {editorFullScreen ? (
          <Button
            id="editor-preview-btn"
            name="editor-preview-btn"
            type="button"
            variant="ghost"
            size="icon"
            className="ml-20 text-muted-foreground"
            onClick={() => setEditorFullScreen(false)}
          >
            {/* <Menu className="h-5 w-5" /> */}

            <svg
              className="h-5 w-5 fill-muted-foreground"
              version="1.1"
              viewBox="0 0 23.3887 17.998"
            >
              <g>
                <rect height="17.998" opacity="0" width="23.3887" x="0" y="0" />
                <path
                  d="M3.06641 17.998L19.9609 17.998C22.0117 17.998 23.0273 16.9824 23.0273 14.9707L23.0273 3.04688C23.0273 1.03516 22.0117 0.0195312 19.9609 0.0195312L3.06641 0.0195312C1.02539 0.0195312 0 1.02539 0 3.04688L0 14.9707C0 16.9922 1.02539 17.998 3.06641 17.998ZM3.08594 16.4258C2.10938 16.4258 1.57227 15.9082 1.57227 14.8926L1.57227 3.125C1.57227 2.10938 2.10938 1.5918 3.08594 1.5918L19.9414 1.5918C20.9082 1.5918 21.4551 2.10938 21.4551 3.125L21.4551 14.8926C21.4551 15.9082 20.9082 16.4258 19.9414 16.4258ZM7.44141 16.7285L8.97461 16.7285L8.97461 1.29883L7.44141 1.29883ZM5.56641 5.21484C5.85938 5.21484 6.12305 4.95117 6.12305 4.66797C6.12305 4.375 5.85938 4.12109 5.56641 4.12109L3.4668 4.12109C3.17383 4.12109 2.91992 4.375 2.91992 4.66797C2.91992 4.95117 3.17383 5.21484 3.4668 5.21484ZM5.56641 7.74414C5.85938 7.74414 6.12305 7.48047 6.12305 7.1875C6.12305 6.89453 5.85938 6.65039 5.56641 6.65039L3.4668 6.65039C3.17383 6.65039 2.91992 6.89453 2.91992 7.1875C2.91992 7.48047 3.17383 7.74414 3.4668 7.74414ZM5.56641 10.2637C5.85938 10.2637 6.12305 10.0195 6.12305 9.72656C6.12305 9.43359 5.85938 9.17969 5.56641 9.17969L3.4668 9.17969C3.17383 9.17969 2.91992 9.43359 2.91992 9.72656C2.91992 10.0195 3.17383 10.2637 3.4668 10.2637Z"
                  // fill-opacity="0.85"
                />
              </g>
            </svg>
          </Button>
        ) : (
          <Button
            id="editor-preview-btn"
            name="editor-preview-btn"
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={() => setEditorFullScreen(true)}
          >
            <svg
              className="h-5 w-5 fill-muted-foreground"
              version="1.1"
              viewBox="0 0 23.3887 17.998"
            >
              <g>
                <rect height="17.998" opacity="0" width="23.3887" x="0" y="0" />
                <path
                  d="M3.06641 17.998L19.9609 17.998C22.0117 17.998 23.0273 16.9824 23.0273 14.9707L23.0273 3.04688C23.0273 1.03516 22.0117 0.0195312 19.9609 0.0195312L3.06641 0.0195312C1.02539 0.0195312 0 1.02539 0 3.04688L0 14.9707C0 16.9922 1.02539 17.998 3.06641 17.998ZM3.08594 16.4258C2.10938 16.4258 1.57227 15.9082 1.57227 14.8926L1.57227 3.125C1.57227 2.10938 2.10938 1.5918 3.08594 1.5918L19.9414 1.5918C20.9082 1.5918 21.4551 2.10938 21.4551 3.125L21.4551 14.8926C21.4551 15.9082 20.9082 16.4258 19.9414 16.4258ZM7.44141 16.7285L8.97461 16.7285L8.97461 1.29883L7.44141 1.29883ZM5.56641 5.21484C5.85938 5.21484 6.12305 4.95117 6.12305 4.66797C6.12305 4.375 5.85938 4.12109 5.56641 4.12109L3.4668 4.12109C3.17383 4.12109 2.91992 4.375 2.91992 4.66797C2.91992 4.95117 3.17383 5.21484 3.4668 5.21484ZM5.56641 7.74414C5.85938 7.74414 6.12305 7.48047 6.12305 7.1875C6.12305 6.89453 5.85938 6.65039 5.56641 6.65039L3.4668 6.65039C3.17383 6.65039 2.91992 6.89453 2.91992 7.1875C2.91992 7.48047 3.17383 7.74414 3.4668 7.74414ZM5.56641 10.2637C5.85938 10.2637 6.12305 10.0195 6.12305 9.72656C6.12305 9.43359 5.85938 9.17969 5.56641 9.17969L3.4668 9.17969C3.17383 9.17969 2.91992 9.43359 2.91992 9.72656C2.91992 10.0195 3.17383 10.2637 3.4668 10.2637Z"
                  // fill-opacity="0.85"
                />
              </g>
            </svg>
          </Button>
        )}

        <div className="flex gap-x-2">
          <Button
            id="editor-preview-btn"
            name="editor-preview-btn"
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
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
            className="text-muted-foreground"
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
