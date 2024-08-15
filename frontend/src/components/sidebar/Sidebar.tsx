import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import * as wails from "@wailsio/runtime";
import { Events } from "@wailsio/runtime";
import { WailsEvent } from "@wailsio/runtime/types/events";
import { ListNostrKeys } from "&/github.com/nodetec/captains-log/service/nostrkeyservice";
import { ScrollArea } from "~/components/ui/scroll-area";
import { CircleUserRound, Settings2 } from "lucide-react";

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
    <div className="flex h-full bg-secondary flex-col justify-between pt-[1.125rem]">
      <div className="flex justify-end gap-x-4 pb-4 pr-4">
        <div className="flex justify-end gap-4">
          {keys?.length === 1 ? (
            <CircleUserRound className="h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground" />
          ) : (
            <Login />
          )}

          <Settings2
            onClick={handleOpenSettings}
            className={`h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground ${settingsWindowClosed ? "" : "pointer-events-none opacity-50"}`}
          />
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
