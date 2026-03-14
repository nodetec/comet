import { Info, PenLine, Radio, User, X } from "lucide-react";

import {
  DialogRoot,
  DialogPortal,
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUIStore } from "@/stores/use-ui-store";

import { EditorSettings } from "./editor-settings";
import { GeneralSettings } from "./general-settings";
import { ProfileSettings } from "./profile-settings";
import { RelaysSettings } from "./relays-settings";

const tabs = [
  { id: "general" as const, label: "General", icon: Info },
  { id: "editor" as const, label: "Editor", icon: PenLine },
  { id: "profile" as const, label: "Profile", icon: User },
  { id: "relays" as const, label: "Relays", icon: Radio },
];

export function SettingsDialog() {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const activeTab = useUIStore((s) => s.settingsTab);
  const setTab = useUIStore((s) => s.setSettingsTab);

  return (
    <DialogRoot open={open} onOpenChange={setOpen} modal>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="flex h-[85%] max-h-[60rem] w-[90%] max-w-[70rem] select-none overflow-hidden p-0">
          <DialogClose className="absolute top-4 right-4 cursor-pointer rounded-sm opacity-70 transition-opacity hover:opacity-100">
            <X className="size-4" />
          </DialogClose>
          <nav className="bg-sidebar flex min-w-64 max-w-64 shrink-0 flex-col border-r px-2 pt-6">
            <DialogTitle className="text-muted-foreground mb-3 px-3 text-xs font-semibold uppercase tracking-wide">
              Settings
            </DialogTitle>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={[
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                  activeTab === tab.id
                    ? "bg-accent/80 text-secondary-foreground"
                    : "text-muted-foreground",
                ].join(" ")}
                onClick={() => setTab(tab.id)}
                type="button"
              >
                <tab.icon className="size-4" />
                {tab.label}
              </button>
            ))}
          </nav>
          <main className="flex-1 overflow-y-auto p-6">
            {activeTab === "general" && <GeneralSettings />}
            {activeTab === "editor" && <EditorSettings />}
            {activeTab === "profile" && <ProfileSettings />}
            {activeTab === "relays" && <RelaysSettings />}
          </main>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
