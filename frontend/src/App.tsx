import Sidebar from "~/components/sidebar/Sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";

// import Editor from "./components/editor/Editor";
import Editor1 from "./components/editor/Editor1";
import Notes from "./components/notes/Notes";

export default function App() {
  return (
    <div className="flex h-dvh w-dvw flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={15} minSize={15}>
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={30}>
          <Notes />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={40}>
          {/* <Editor /> */}
          <Editor1 />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
