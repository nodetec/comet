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
          className="bg-sidebar flex flex-col justify-between select-none"
          disableResponsive
          defaultSize={size.width! > 800 ? 200 : 180}
          minSize={180}
          maxSize={size.width! > 800 ? 300 : 180}
        >
          <SidebarHeader />
          <SidebarNav />
          <NewNotebookBtn />
        </Section>
        <Bar className="flex cursor-col-resize items-center" size={8}>
          <div className="bg-sidebar h-full w-1" />
          <div className="bg-border h-full w-[1px]" />
          <div className="bg-background h-full w-1" />
        </Bar>
        <Section
          className="flex h-full flex-col select-none"
          disableResponsive
          defaultSize={280}
          minSize={210}
          maxSize={size.width! > 800 ? undefined : 210}
        >
          <NotesHeader />
          <NotesSearch />
          <NoteList />
        </Section>
        <Bar className="flex cursor-col-resize items-center" size={5}>
          <div className="bg-accent/40 h-full w-[1px]" />
        </Bar>
        <Section minSize={300}>
          <div className="flex h-screen w-full flex-1 flex-col items-center select-none">
            <Editor />
          </div>
        </Section>
      </Container>
    </div>
  );
}
