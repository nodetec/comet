import Sidebar from "~/components/sidebar/Sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";

import EditorWrapper from "./components/editor/EditorWrapper";
import Notes from "./components/notes/Notes";
import useNoteMenu from "./hooks/useNoteMenu";
import useNoteTagMenu from "./hooks/useNoteTagMenu";
import useSettingsRefresh from "./hooks/useSettingsRefresh";
import useTagMenu from "./hooks/useTagMenu";
import useTrashNoteMenu from "./hooks/useTrashNoteMenu";
import { useAppState } from "./store";

export default function App() {
  useNoteMenu();
  useTagMenu();
  useNoteTagMenu();
  useTrashNoteMenu();
  useSettingsRefresh();

  const editorFullScreen = useAppState((state) => state.editorFullScreen);

  return (
    <div className="flex h-dvh w-dvw flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        {!editorFullScreen && (
          <>
            <ResizablePanel className="min-w-40" defaultSize={18} minSize={18}>
              <Sidebar />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel className="min-w-60" defaultSize={26} minSize={26}>
              <Notes />
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}
        <ResizablePanel minSize={40}>
          <EditorWrapper />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
