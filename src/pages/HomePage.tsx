import ContextSidebar from "~/components/context/ContextSidebar";
import EditorWrapper from "~/components/editor/EditorWrapper";
import NoteFeed from "~/components/notes/NoteFeed";
import NoteFeedHeader from "~/components/notes/NoteFeedHeader";
import SearchFeed from "~/components/notes/SearchFeed";
import SearchNotes from "~/components/notes/SearchNotes";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { useAppContext } from "~/store";

import Settings from "./Settings";

export default function HomePage() {
  const { noteSearch, activePage } = useAppContext();

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={15} minSize={15}>
          <ContextSidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={30}>
          <div className="flex max-h-screen flex-col">
            <NoteFeedHeader />
            <SearchNotes />
            {noteSearch ? <SearchFeed noteSearch={noteSearch} /> : <NoteFeed />}
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="border-sky-500" minSize={10}>
          {activePage === "settings" && <Settings />}
          {activePage === "editor" && <EditorWrapper />}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
