import { Bar, Container, Section } from "@column-resizer/react";
import { Separator } from "@radix-ui/react-separator";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";

import { Editor } from "./features/editor";
import { NoteList, NotesHeader, SearchBox } from "./features/notes";
import { Sidebar } from "./features/sidebar";
import useAppFocus from "./hooks/useAppFocus";
import useNotebookEvents from "./hooks/useNotebookEvents";
import useNoteEvents from "./hooks/useNoteEvents";

export default function ResizableLayout() {
  useNoteEvents();
  useNotebookEvents();
  useAppFocus();

  return (
    <div className="flex h-dvh w-dvw flex-col items-center justify-center">
      <Container className="flex h-full w-full">
        <Section
          className="select-none"
          disableResponsive
          defaultSize={200}
          minSize={200}
          maxSize={400}
        >
          <Sidebar />
        </Section>
        <Bar className="flex cursor-col-resize items-center" size={10}>
          <div className="h-full w-[5px] bg-secondary" />
          <div className="h-full w-[1px] bg-border" />
          <div className="h-full w-[5px] bg-background" />
        </Bar>
        <Section
          className="select-none"
          disableResponsive
          defaultSize={400}
          minSize={250}
        >
          <NotesHeader />
          <SearchBox />
          <NoteList />
        </Section>
        <Bar className="flex cursor-col-resize items-center" size={10}>
          <div className="h-full w-[5px] bg-background" />
          <div className="h-full w-[1px] bg-border" />
          <div className="h-full w-[5px] bg-background" />
        </Bar>
        <Section minSize={400}>
          <Editor />
        </Section>
      </Container>
    </div>
  );
}
