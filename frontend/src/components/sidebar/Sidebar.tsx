import { useQuery } from "@tanstack/react-query";
import { ListNostrKeys } from "&/github.com/nodetec/captains-log/service/nostrkeyservice";
import { ScrollArea } from "~/components/ui/scroll-area";
import { SettingsDialog } from "~/features/settings";
import { CircleUserRound } from "lucide-react";

import { Button } from "../ui/button";
import AllNotes from "./AllNotes";
import Login from "./Login";
import { NotebookComboBox } from "./NotebookComboBox";
import Tags from "./Tags";
import Trash from "./Trash";

export default function Sidebar() {
  const getKeys = async () => {
    const keys = await ListNostrKeys();
    return keys;
  };

  const { data: keys } = useQuery({
    queryKey: ["nostrKeys"],
    queryFn: getKeys,
  });

  return (
    <div className="flex h-full flex-col justify-between bg-secondary pt-3">
      <div className="flex justify-end gap-x-4 pb-4 pr-4">
        <div className="flex justify-end gap-1">
          {keys?.length === 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-20 text-muted-foreground"
            >
              <CircleUserRound className="h-6 w-6" />
            </Button>
          ) : (
            <Login />
          )}
          <SettingsDialog />
        </div>
      </div>
      <ScrollArea className="flex h-full flex-col gap-y-2 [&>div>div[style]]:!block">
        <div className="flex flex-col gap-y-2 px-3">
          <AllNotes />
          <NotebookComboBox />
          <Trash />
          <Tags />
        </div>
      </ScrollArea>
    </div>
  );
}
