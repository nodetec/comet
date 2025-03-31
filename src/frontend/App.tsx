import { Bar, Container, Section } from "@column-resizer/react";
import { useWindowSize } from "@uidotdev/usehooks";

import { Editor } from "./features/editor";
import { NotesHeader, NotesSearch } from "./features/notes";
import { NoteList } from "./features/notes/components/NoteList";
import { NewNotebookBtn, SidebarHeader, SidebarNav } from "./features/sidebar";
import useAppFocus from "./hooks/useAppFocus";
import { useEvents } from "./hooks/useEvents";
import { useSync } from "./hooks/useSync";

export default function ResizableLayout() {
  useAppFocus();
  useEvents();
  useSync();
  const size = useWindowSize();

  return (
    <div className="flex h-dvh w-dvw flex-col items-center justify-center">
      <Container className="relative h-full w-full">
        <Section
          className="flex select-none flex-col justify-between bg-sidebar"
          disableResponsive
          defaultSize={size.width! > 800 ? 200 : 180}
          minSize={180}
          maxSize={size.width! > 800 ? 300 : 180}
        >
          <SidebarHeader />
          <SidebarNav />
          <NewNotebookBtn />
        </Section>
        <Bar
          className="z-30 cursor-col-resize bg-border"
          expandInteractiveArea={{ left: 5, right: 5 }}
          size={1}
        />
        <Section
          className="flex h-full select-none flex-col px-2"
          disableResponsive
          defaultSize={280}
          minSize={210}
          maxSize={size.width! > 800 ? 300 : 210}
        >
          <NotesHeader />
          <NotesSearch />
          <NoteList />
        </Section>
        <Bar
          className="z-30 cursor-col-resize bg-border"
          expandInteractiveArea={{ left: 5, right: 5 }}
          size={1}
        />
        <Section minSize={size.width! > 800 ? 300 : 210}>
          <div className="flex h-screen w-full flex-1 select-none flex-col items-center">
            <Editor />
          </div>
        </Section>
      </Container>
    </div>
  );
}
