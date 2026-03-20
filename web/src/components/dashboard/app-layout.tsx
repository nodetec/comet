import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { FileText, LogOut, Orbit, Menu } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "~/components/ui/sheet";
import { useNostr } from "~/lib/nostr/use-nostr";
import { cn } from "~/lib/utils";

const navItems = [
  { to: "/", icon: FileText, label: "Notes", exact: true },
] as const;

function truncatePubkey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { pubkey, signOut } = useNostr();

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
      {pubkey && (
        <div className="px-4 py-2">
          <p
            className="text-sidebar-foreground/50 truncate font-mono text-xs"
            title={pubkey}
          >
            {truncatePubkey(pubkey)}
          </p>
        </div>
      )}
      <div className="flex items-center justify-end p-2">
        <Button variant="ghost" size="icon" onClick={signOut} title="Logout">
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
      {/* Desktop sidebar */}
      <aside className="border-sidebar-border bg-sidebar hidden w-56 shrink-0 flex-col border-r md:flex">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
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

        <main className="bg-background flex flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
