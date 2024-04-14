import AssociatedTags from "~/components/editor/AssociatedTags";
import Editor from "~/components/editor/Editor";
import EditorControls from "~/components/editor/EditorControls";
import TagInput from "~/components/editor/TagInput";
import NoteFeed from "~/components/notes/NoteFeed";
import TagList from "~/components/tags/TagList";
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
          <TagList />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="px-2" defaultSize={30} minSize={30}>
          <NoteFeed />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="px-4 pt-4" minSize={10}>
          <>
            {activeNote && (
              <>
                <div className="flex items-center justify-between">
                  {/*   <EditorTitle /> */}
                  <EditorControls />
                </div>
                <div className="flex max-h-screen flex-col overflow-y-auto">
                  <Editor />
                  <div className="flex items-center gap-x-2">
                    <AssociatedTags />
                    <TagInput />
                  </div>
                </div>
              </>
            )}
          </>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
