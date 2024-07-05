// import { NotebookService } from "&/github.com/nodetec/captains-log/service";

import * as wails from "@wailsio/runtime";
import { ScrollArea } from "~/components/ui/scroll-area";
import { CloudOffIcon, Settings2 } from "lucide-react";

import AllNotes from "./AllNotes";
import { NotebookComboBox } from "./NotebookComboBox";
import Tags from "./Tags";
import Trash from "./Trash";

export default function Sidebar() {
  const handleOpenSettings = () => {
    wails.Events.Emit({ name: "open-settings-window", data: "" });
  };

  return (
    <div className="flex h-full flex-col justify-between pt-4">
      <div className="flex justify-end gap-x-4 pb-4 pr-4">
        <div className="flex justify-end">
          <CloudOffIcon
            // onClick={handleCreateNotebook}
            className="h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground"
          />
        </div>
        <div className="flex justify-end">
          <Settings2
            onClick={handleOpenSettings}
            className="h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground"
          />
        </div>
      </div>
      <ScrollArea className="flex h-full flex-col gap-y-2">
        <div className="flex flex-col gap-y-2 px-3">
          <AllNotes />
          <NotebookComboBox />
          <Trash />
          <Tags />
        </div>
      </ScrollArea>
      {/* <Login /> */}
    </div>
  );
}
