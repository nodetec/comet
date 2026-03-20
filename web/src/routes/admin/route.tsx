import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import { AdminAppLayout } from "~/components/admin/app-layout";
import { checkAuth } from "~/server/admin/auth";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/admin/login") return;
    const { authenticated } = await checkAuth();
    if (!authenticated) {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const location = useLocation();
  if (location.pathname === "/admin/login") {
    return <Outlet />;
  }
  return (
    <AdminAppLayout>
      <Outlet />
    </AdminAppLayout>
  );
}
