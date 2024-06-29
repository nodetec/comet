import { NullInt64, NullString } from "&/database/sql/models";
import { CreateNoteParams } from "&/github.com/nodetec/captains-log/db/models";
import { NoteService } from "&/github.com/nodetec/captains-log/service";
import { ArrowDownNarrowWide, PenBoxIcon } from "lucide-react";

import dayjs from "dayjs";


import { Button } from "../ui/button";
import { useQueryClient } from "@tanstack/react-query";

export default function NoteFeedHeader() {

  const queryClient = useQueryClient();

  async function handleCreateNote(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    // console.log(editorView.current.state.doc.toString());
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

    const res = await NoteService.CreateNote(noteParams);

    void queryClient.invalidateQueries({
      queryKey: ["notes"],
    });
    console.log(res);
  }

  return (
    <div className="flex justify-between px-3 pt-2">
      <div className="flex items-center justify-center gap-x-1">
        <Button
          // disabled={data?.[0] && data[0].id === -1}
          className="text-muted-foreground"
          // onClick={handleNewNote}
          variant="ghost"
          size="icon"
        >
          <ArrowDownNarrowWide className="h-[1.2rem] w-[1.2rem]" />
        </Button>
        <h1 className="cursor-default text-lg font-bold">{"All Notes"}</h1>
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
