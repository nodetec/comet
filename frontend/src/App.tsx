import Sidebar from "~/components/sidebar/Sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import Notes from "./components/notes/Notes";

export default function App() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-screen w-full">
        <ResizablePanel defaultSize={15} minSize={15}>
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={30}>
          <Notes />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={40}>
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-4xl">Three</span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
