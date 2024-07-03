import { useQueryClient } from "@tanstack/react-query";
import { NullInt64, NullString } from "&/database/sql/models";
import { NoteService } from "&/github.com/nodetec/captains-log/service";
import { useAppState } from "~/store";
import dayjs from "dayjs";
import { ArrowDownNarrowWide, PenBoxIcon } from "lucide-react";

import { Button } from "../ui/button";

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
    );

    setActiveNote(note);

    void queryClient.invalidateQueries({
      queryKey: ["notes"],
    });
  }

  function title(feedType: string) {
    if (feedType === "all") return "All Notes";
    if (feedType === "notebook") return activeNotebook?.Name;
    if (feedType === "tag") return activeTag?.Name;
    if (feedType === "trash") return "Trash";
  }

  return (
    <div className="flex justify-between px-3 pt-2">
      <div className="flex items-center justify-center gap-x-1">
        <Button
          variant="ghost"
          className="cursor-pointer text-muted-foreground hover:bg-background hover:text-foreground"
          size="icon"
        >
          <ArrowDownNarrowWide className="h-[1.2rem] w-[1.2rem]" />
        </Button>
        <h1 className="cursor-default text-lg font-bold">{title(feedType)}</h1>
      </div>
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
