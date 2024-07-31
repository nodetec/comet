import { useQueryClient } from "@tanstack/react-query";
import { NullInt64, NullString } from "&/database/sql/models";
import {
  NoteService,
  NoteTagService,
} from "&/github.com/nodetec/captains-log/service";
import { useAppState } from "~/store";
import dayjs from "dayjs";
import { ChevronDown, PenBoxIcon } from "lucide-react";

import { Button } from "../ui/button";
import { SortDropdown } from "./SortDropdown";

type Props = {
  feedType: string;
};

export default function NoteFeedHeader({ feedType }: Props) {
  const queryClient = useQueryClient();
  const { setActiveNote, activeTag, activeNotebook } = useAppState();

  async function handleCreateNote() {
    const note = await NoteService.CreateNote(
      dayjs().format("YYYY-MM-DD"),
      "",
      activeNotebook?.ID ?? 0,
      new NullInt64({
        Int64: undefined,
        Valid: false,
      }),
      new NullString({
        String: undefined,
        Valid: false,
      }),
      new NullString({
        String: undefined,
        Valid: false,
      }),
      "note",
      "text",
    );

    if (activeTag) {
      await NoteTagService.AddTagToNote(note.ID, activeTag.ID);
    }

    setActiveNote(note);

    void queryClient.invalidateQueries({
      queryKey: ["notes"],
    });
  }

  function title(feedType: string) {
    if (feedType === "all") return "All Notes";
    if (feedType === "notebook") return activeNotebook?.Name;
    if (feedType === "trash") return "Trash";
  }

  return (
    <div className="flex justify-between px-3 pt-3">
      <SortDropdown>
        <div className="flex cursor-pointer items-center justify-center gap-x-1 pl-2">
          <h1 className="line-clamp-1 truncate text-ellipsis whitespace-break-spaces break-all text-lg font-bold">
            {title(feedType)}
          </h1>
          <ChevronDown className="mr-4 mt-1 h-[1rem] w-[1rem] shrink-0 text-muted-foreground" />
        </div>
      </SortDropdown>
      <Button
        disabled={feedType === "trash"}
        variant="ghost"
        className="cursor-pointer text-muted-foreground hover:bg-background hover:text-foreground"
        size="icon"
      >
        <PenBoxIcon onClick={handleCreateNote} className="h-5 w-5" />
      </Button>
    </div>
  );
}
