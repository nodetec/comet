import { Info, PenLine } from "lucide-react";

import {
  DialogRoot,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUIStore } from "@/stores/use-ui-store";

import { EditorSettings } from "./editor-settings";
import { GeneralSettings } from "./general-settings";

const tabs = [
  { id: "general" as const, label: "General", icon: Info },
  { id: "editor" as const, label: "Editor", icon: PenLine },
];

export function SettingsDialog() {
  const open = useUIStore((s) => s.settingsOpen);
  const setOpen = useUIStore((s) => s.setSettingsOpen);
  const activeTab = useUIStore((s) => s.settingsTab);
  const setTab = useUIStore((s) => s.setSettingsTab);

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="flex h-[440px] w-[640px] overflow-hidden p-0">
          <nav className="bg-sidebar flex w-48 shrink-0 flex-col border-r px-2 pt-6">
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
                    : "text-muted-foreground hover:bg-accent/40 hover:text-secondary-foreground",
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
          </main>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
