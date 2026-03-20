import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { DashboardAppLayout } from "~/components/dashboard/app-layout";
import { NostrProvider } from "~/lib/nostr/use-nostr";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/dashboard/login") return;
    const pubkey = localStorage.getItem("pubkey");
    if (!pubkey) {
      throw redirect({ to: "/dashboard/login" });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const location = useLocation();
  if (location.pathname === "/dashboard/login") {
    return (
      <NostrProvider>
        <Outlet />
      </NostrProvider>
    );
  }
  return (
    <NostrProvider>
      <DashboardAppLayout>
        <Outlet />
      </DashboardAppLayout>
    </NostrProvider>
  );
}
