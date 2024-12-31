import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { EllipsisVerticalIcon } from "lucide-react";

import { Button } from "./components/ui/button";
import { Editor, PublishDialog } from "./features/editor";
import { NoteList, NotesHeader, SearchBox } from "./features/notes";
import { Sidebar } from "./features/sidebar";
import useNotebookEvents from "./hooks/useNotebookEvents";
import useNoteEvents from "./hooks/useNoteEvents";

export default function ResizableLayout() {
  useNoteEvents();
  useNotebookEvents();

  return (
    <div className="flex h-dvh w-dvw flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel
          className="min-w-44 select-none"
          defaultSize={18.5}
          minSize={18.5}
          maxSize={20}
        >
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          className="flex h-full min-w-60 select-none flex-col"
          defaultSize={26}
          minSize={26}
        >
          <NotesHeader />
          <SearchBox />
          <NoteList />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={40}>
          <div className="flex justify-end p-2">
            <PublishDialog />
            <Button type="button" variant="ghost" size="icon">
              <EllipsisVerticalIcon />
            </Button>
          </div>
          <Editor />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
