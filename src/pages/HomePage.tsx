import ContextSidebar from "~/components/context/ContextSidebar";
import Editor from "~/components/editor/Editor";
import NoteFeed from "~/components/notes/NoteFeed";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";

export default function HomePage() {

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={15} minSize={15}>
          <ContextSidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={30}>
          <NoteFeed />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="border-sky-500" minSize={10}>
          <Editor />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
