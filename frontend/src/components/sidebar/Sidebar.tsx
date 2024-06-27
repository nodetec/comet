import AllNotes from "~/components/sidebar/AllNotes";
import { ScrollArea } from "~/components/ui/scroll-area";

import Login from "./Login";
import Tags from "./Tags";
import Trash from "./Trash";

export default function Sidebar() {
  return (
    <div className="flex h-full flex-col justify-between pt-8">
      <ScrollArea className="flex h-full flex-col p-2">
        <div>
          <AllNotes />
          <Trash />
          <Tags />
        </div>
      </ScrollArea>
      <Login />
    </div>
  );
}
