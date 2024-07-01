import { GearIcon } from "@radix-ui/react-icons";
import * as wails from "@wailsio/runtime";
import AllNotes from "~/components/sidebar/AllNotes";
import { ScrollArea } from "~/components/ui/scroll-area";

import Login from "./Login";
import Tags from "./Tags";
import Trash from "./Trash";

export default function Sidebar() {
  const handleOpenSettings = () => {
    wails.Events.Emit({ name: "open-settings-window", data: "" });
  };

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="pt-4 pb-2 flex justify-end px-4">

      <GearIcon
        onClick={handleOpenSettings}
        className="h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground"
      />
      </div>

      <ScrollArea className="flex h-full flex-col p-2">
        <div className="px-1">
          <AllNotes />
          <Trash />
          <Tags />
        </div>
      </ScrollArea>
      <Login />
    </div>
  );
}
