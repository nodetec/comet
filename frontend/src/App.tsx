import { useEffect, useState } from "react";

import * as wails from "@wailsio/runtime";
import Sidebar from "~/components/sidebar/Sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import Settings from "~/windows/settings/Settings";

import EditorWrapper from "./components/editor/EditorWrapper";
import Notes from "./components/notes/Notes";
import useNoteMenu from "./hooks/useNoteMenu";
import useNoteTagMenu from "./hooks/useNoteTagMenu";
import useTagMenu from "./hooks/useTagMenu";
import useTrashNoteMenu from "./hooks/useTrashNoteMenu";

export default function App() {
  const [windowName, setWindowName] = useState("");

  useEffect(() => {
    const getWindowName = async () => {
      const windowNameResponse = await wails.Window.Name();
      console.log("windowNameResponse ", windowNameResponse);
      setWindowName(windowName);
    };

    getWindowName().catch(console.error);
  }, []);

  useNoteMenu();
  useTagMenu();
  useNoteTagMenu();
  useTrashNoteMenu();

  return (
    <div>
      {windowName === "Settings" && <Settings />}
      {windowName !== "Settings" && (
        <div className="flex h-dvh w-dvw flex-col items-center justify-center">
          <ResizablePanelGroup direction="horizontal" className="h-full w-full">
            <ResizablePanel defaultSize={18} minSize={18}>
              <Sidebar />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={26} minSize={26}>
              <Notes />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel minSize={40}>
              <EditorWrapper />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  );
}
