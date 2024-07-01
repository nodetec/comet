import { NotebookService } from "&/github.com/nodetec/captains-log/service";
import AllNotes from "~/components/sidebar/AllNotes";
import { ScrollArea } from "~/components/ui/scroll-area";
import { NotebookPen } from "lucide-react";

import Login from "./Login";
import { Notebook } from "./Notebook";
import Tags from "./Tags";
import Trash from "./Trash";

export default function Sidebar() {
  const handleCreateNotebook = () => {
    NotebookService.CreateNotebook("New Notebook");
  };

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex justify-end px-4 pb-2 pt-4">
        <NotebookPen
          onClick={handleCreateNotebook}
          className="h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground"
        />
      </div>
      <ScrollArea className="flex h-full flex-col p-2">
        <div className="px-1">
          <Notebook />
          <AllNotes />
          <Trash />
          <Tags />
        </div>
      </ScrollArea>
      <Login />
    </div>
  );
}
