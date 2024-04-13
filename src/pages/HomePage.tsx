import { createContextMenu } from "~/api";
import AssociatedTags from "~/components/editor/AssociatedTags";
import Editor from "~/components/editor/Editor";
import EditorControls from "~/components/editor/EditorControls";
import EditorTitle from "~/components/editor/EditorTitle";
import TagInput from "~/components/editor/TagInput";
import NoteFeed from "~/components/notes/NoteFeed";
import NoteFeedHeader from "~/components/notes/NoteFeedHeader";
import SearchNotes from "~/components/notes/SearchNotes";
import TagList from "~/components/tags/TagList";
import { Button } from "~/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";


export default function HomePage() {

  const handleTagClick = async () => {
    await createContextMenu()
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={15} minSize={15}>
          <Button onClick={handleTagClick} />
          <TagList />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="px-2" defaultSize={30} minSize={30}>
          <NoteFeedHeader />
          <SearchNotes />
          <NoteFeed />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="px-4 pt-4" minSize={10}>
          <div className="flex items-center justify-between">
            <EditorTitle />
            <EditorControls />
          </div>
          <div className="flex items-center gap-x-2">
            <AssociatedTags />
            <TagInput />
          </div>
          <Editor />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
