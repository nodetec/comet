import { useQueryClient } from "@tanstack/react-query";
import { NullInt64, NullString } from "&/database/sql/models";
import { CreateNoteParams } from "&/github.com/nodetec/captains-log/db/models";
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
  const { setActiveNote, activeTag } = useAppState();

  async function handleCreateNote(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const noteParams: CreateNoteParams = {
      StatusID: new NullInt64({ Int64: undefined, Valid: false }),
      NotebookID: new NullInt64({ Int64: undefined, Valid: false }),
      Content: "",
      Title: dayjs().format("YYYY-MM-DD"),
      CreatedAt: new Date().toISOString(),
      ModifiedAt: new Date().toISOString(),
      PublishedAt: new NullString({ String: undefined, Valid: false }),
      EventID: new NullString({ String: undefined, Valid: false }),
    };

    const note = await NoteService.CreateNote(noteParams);

    setActiveNote(note);

    void queryClient.invalidateQueries({
      queryKey: ["notes"],
    });
  }

  function title(feadType: string) {
    if (feedType === "all") return "All notes";
    if (feedType === "tag") return activeTag?.Name;
    if (feedType === "trash") return "Trash";
  }

  return (
    <div className="flex justify-between px-3 pt-2">
      <div className="flex items-center justify-center gap-x-1">
        <Button className="text-muted-foreground" variant="ghost" size="icon">
          <ArrowDownNarrowWide className="h-[1.2rem] w-[1.2rem]" />
        </Button>
        <h1 className="cursor-default text-lg font-bold">{title(feedType)}</h1>
      </div>
      <div>
        <Button
          // disabled={data?.[0] && data[0].id === -1}
          className="text-muted-foreground"
          onClick={handleCreateNote}
          variant="ghost"
          size="icon"
        >
          <PenBoxIcon className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </div>
    </div>
  );
}
