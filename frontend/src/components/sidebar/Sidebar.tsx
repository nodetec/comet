import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import * as wails from "@wailsio/runtime";
import { Events } from "@wailsio/runtime";
import { WailsEvent } from "@wailsio/runtime/types/events";
import { ListNostrKeys } from "&/github.com/nodetec/captains-log/service/nostrkeyservice";
import { ScrollArea } from "~/components/ui/scroll-area";
import { CircleUserRound, Settings2 } from "lucide-react";

import { Button } from "../ui/button";
import AllNotes from "./AllNotes";
import Login from "./Login";
// import Login from "./Login";
import { NotebookComboBox } from "./NotebookComboBox";
import Tags from "./Tags";
import Trash from "./Trash";

export default function Sidebar() {
  const [settingsWindowClosed, setSettingsWindowClosed] = useState(true);

  useEffect(() => {
    const handleSettingsWindowClose = (_: WailsEvent) => {
      setSettingsWindowClosed(true);
    };

    Events.On("settingsWindowClosed", handleSettingsWindowClose);

    return () => {
      Events.Off("settingsWindowClosed");
    };
  }, []);

  const handleOpenSettings = () => {
    wails.Events.Emit({ name: "openSettingsWindow", data: "" });
    setSettingsWindowClosed(false);
  };

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

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            onClick={handleOpenSettings}
          >
            <Settings2
              className={`h-5 w-5 text-muted-foreground ${settingsWindowClosed ? "" : "pointer-events-none opacity-50"}`}
            />
          </Button>
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
