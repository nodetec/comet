import { createFileRoute } from "@tanstack/react-router";
import { NotesPage } from "~/components/dashboard/notes-page";

export const Route = createFileRoute("/dashboard/")({
  component: NotesPage,
});
