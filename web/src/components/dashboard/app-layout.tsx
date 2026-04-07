import { useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, Orbit, Menu } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "~/components/ui/sheet";
import { userLogout } from "~/server/user/auth";
import { cn } from "~/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", exact: true },
] as const;

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  async function handleSignOut() {
    await userLogout();
    void navigate({ to: "/login" });
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-5">
        <Orbit className="text-sidebar-primary h-5 w-5" />
        <span className="text-sidebar-foreground text-sm font-semibold">
          Comet
        </span>
      </div>
      <Separator className="bg-sidebar-border" />
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {navItems.map((item) => {
          const isActive =
            "exact" in item && item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Separator className="bg-sidebar-border" />
      <div className="flex items-center justify-end p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSignOut}
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}

export function DashboardAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="border-sidebar-border bg-sidebar hidden w-56 shrink-0 flex-col border-r md:flex">
        <SidebarContent />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-border bg-background flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="bg-sidebar w-56 p-0">
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Orbit className="text-primary h-4 w-4" />
          <span className="text-sm font-semibold">Comet</span>
        </header>

        <main className="bg-background flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
