import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";

import { Editor } from "./features/editor";
import { EditorDropdown } from "./features/editor-dropdown";
import { Notes } from "./features/notes";
import { SettingsBtn } from "./features/settings";
import { Sidebar } from "./features/sidebar";
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
        <ResizablePanel
          hidden={editorFullScreen}
          className="min-w-44"
          defaultSize={18}
          minSize={18}
        >
          <Sidebar Settings={SettingsBtn} />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel
          hidden={editorFullScreen}
          className="min-w-60"
          defaultSize={26}
          minSize={26}
        >
          <Notes />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={40}>
          <Editor EditorDropdown={EditorDropdown} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
