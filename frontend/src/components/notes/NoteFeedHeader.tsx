import { ArrowDownNarrowWide, PenBoxIcon } from "lucide-react";

import { Button } from "../ui/button";

export default function NoteFeedHeader() {
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
          // onClick={handleNewNote}
          variant="ghost"
          size="icon"
        >
          <PenBoxIcon className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </div>
    </div>
  );
}
