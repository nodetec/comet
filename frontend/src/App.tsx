import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import Sidebar from "~/components/sidebar/Sidebar";

export default function App() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={15} minSize={15} >
          <div className="flex h-full max-h-screen w-full flex-col items-center justify-center">
            {/* <span className="text-4xl">One</span> */}
            <Sidebar />
            
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={30} minSize={30}>
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-4xl">Two</span>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel minSize={40}>
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-4xl">Three</span>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
