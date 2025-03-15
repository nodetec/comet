import React from "react";

import { Bar, Container, Section } from "@column-resizer/react";

import { Editor } from "./features/editor";
import { NotesHeader, NotesSearch } from "./features/notes";
import { NoteList } from "./features/notes/components/NoteList";
import { NewNotebookBtn, SidebarHeader, SidebarNav } from "./features/sidebar";
import useAppFocus from "./hooks/useAppFocus";
import { useEvents } from "./hooks/useEvents";

export default function ResizableLayout() {
  useAppFocus();
  useEvents();

  return (
    <div className="flex h-dvh w-dvw flex-col items-center justify-center">
      <Container className="h-full w-full">
        <Section
          className="bg-sidebar flex flex-col justify-between select-none"
          disableResponsive
          defaultSize={200}
          minSize={180}
          maxSize={300}
        >
          <SidebarHeader />
          <SidebarNav />
          <NewNotebookBtn />
        </Section>
        <Bar className="flex cursor-col-resize items-center" size={10}>
          <div className="bg-sidebar h-full w-[5px]" />
          <div className="bg-border h-full w-[1px]" />
          <div className="bg-background h-full w-[5px]" />
        </Bar>
        <Section
          className="flex h-full flex-col select-none"
          disableResponsive
          defaultSize={280}
          minSize={250}
        >
          <NotesHeader />
          <NotesSearch />
          <NoteList />
        </Section>
        <Bar className="flex cursor-col-resize items-center" size={10}>
          <div className="bg-background h-full w-[5px]" />
          <div className="bg-border h-full w-[1px]" />
          <div className="bg-background h-full w-[5px]" />
        </Bar>
        <Section minSize={500}>
          <div className="flex h-screen flex-col select-none">
            <Editor />
          </div>
        </Section>
      </Container>
    </div>
  );
}
