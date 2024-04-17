import ContextSidebar from "~/components/context/ContextSidebar";
import Editor from "~/components/editor/Editor";
import ArchiveNoteFeed from "~/components/notes/ArchiveNoteFeed";
import NoteFeed from "~/components/notes/NoteFeed";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { useGlobalState } from "~/store";

export default function HomePage() {
  const { activeNote } = useGlobalState();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={15} minSize={15}>
          <ContextSidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={30}>
          {(activeNote.context === "all" || activeNote.context === "tag") && (
            <NoteFeed />
          )}
          {activeNote.context === "archived" && <ArchiveNoteFeed />}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="border-sky-500" minSize={10}>
          <Editor />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
