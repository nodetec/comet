import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardAppLayout } from "~/components/dashboard/app-layout";
import { UserDashboard } from "~/components/dashboard/user-dashboard";
import { checkUserAuth } from "~/server/user/auth";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { pubkey } = await checkUserAuth();
    if (!pubkey) {
      throw redirect({ to: "/login" });
    }
  },
  component: DashboardRoute,
});

function DashboardRoute() {
  return (
    <DashboardAppLayout>
      <UserDashboard />
    </DashboardAppLayout>
  );
}
