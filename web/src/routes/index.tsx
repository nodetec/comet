import { createFileRoute, redirect } from "@tanstack/react-router";
import { NostrProvider } from "~/lib/nostr/use-nostr";
import { DashboardAppLayout } from "~/components/dashboard/app-layout";
import { NotesPage } from "~/components/dashboard/notes-page";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const pubkey = localStorage.getItem("pubkey");
    if (!pubkey) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <NostrProvider>
      <DashboardAppLayout>
        <NotesPage />
      </DashboardAppLayout>
    </NostrProvider>
  );
}
