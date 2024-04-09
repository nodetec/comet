import Editor from "~/components/editor/Editor";
import EditorTitle from "~/components/editor/EditorTitle";
import NoteFeed from "~/components/notes/NoteFeed";
import NoteFeedHeader from "~/components/notes/NoteFeedHeader";
import TagList from "~/components/tags/TagList";
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
          <TagList />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={30}>
          <NoteFeedHeader />
          <NoteFeed />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={10}>
          <EditorTitle />
          <Editor />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
