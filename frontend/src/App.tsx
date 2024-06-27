import Sidebar from "~/components/sidebar/Sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";

import Notes from "./components/notes/Notes";
import Editor from "./components/editor/Editor";

export default function App() {
  return (
    <div className="flex h-dvh w-dvw flex-col items-center justify-center border border-red-300">
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
          {/* <Editor /> */}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
