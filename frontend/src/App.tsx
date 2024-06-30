import Sidebar from "~/components/sidebar/Sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";

import Editor from "./components/editor/Editor";
import Notes from "./components/notes/Notes";
import useNoteMenu from "./hooks/useNoteMenu";
import useTagMenu from "./hooks/useTagMenu";

export default function App() {
  useNoteMenu();
  useTagMenu();

  return (
    <div className="flex h-dvh w-dvw flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={15} minSize={15}>
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={30}>
          <Notes />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={40}>
          <Editor />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
