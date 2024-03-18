import { useState } from "react";

import { createNote } from "~/api";
import Editor from "~/components/editor/Editor";
import NoteFeed from "~/components/notes/NoteFeed";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";

export default function HomePage() {
  // const [response, setResponse] = useState<string | undefined>("");

  async function handleCreateNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
    const apiResponse = await createNote({
      title: "New Note",
      content: "This is a new note",
    });
    // setResponse(apiResponse.data?.title);
    console.log(apiResponse);
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <ResizablePanelGroup direction="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={15} minSize={15}>
          <div className="flex h-full items-center justify-center p-6 bg-secondary">
            <span className="font-semibold">Tags</span>
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={30} minSize={30}>
          <button onClick={handleCreateNote}>Create Note</button>
          <NoteFeed />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={10}>
          <Editor />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
