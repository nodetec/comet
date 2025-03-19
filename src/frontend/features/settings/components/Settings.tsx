import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { useSyncConfig } from "~/hooks/useSyncConfig";
import { useAppState } from "~/store";

import { NotebookSettings } from "./NotebookSettings";
import { ProfileSettings } from "./ProfileSettings";
import { RelaySettings } from "./RelaySettings";
import { SyncSettings } from "./SyncSettings";

type Props = {
  children: React.ReactNode;
};

export function Settings({ children }: Props) {
  const settingsTab = useAppState((state) => state.settingsTab);
  const setSettingsTab = useAppState((state) => state.setSettingsTab);

  const relays = useAppState((state) => state.relays);
  const syncConfig = useSyncConfig();

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogTitle className="hidden">Settings</DialogTitle>
      <DialogContent
        aria-describedby="settings"
        className="non-draggable border-accent flex h-[85%] max-h-[60rem] w-[90%] max-w-[70rem] overflow-hidden border p-0 select-none"
      >
        <div className="bg-sidebar text-muted-foreground flex min-h-full max-w-64 min-w-64 flex-col gap-y-2 overflow-hidden border-r pt-6 pr-4 pl-4 text-sm">
          <span
            className={`text-secondary-foreground flex items-center rounded-md px-2 py-1.5 text-sm font-medium ${settingsTab === "profile" && "bg-accent/80 text-secondary-foreground"}`}
            onClick={() => setSettingsTab("profile")}
          >
            Profile
          </span>
          <span
            className={`text-secondary-foreground flex items-center rounded-md px-2 py-1.5 text-sm font-medium ${settingsTab === "relays" && "bg-accent/80 text-secondary-foreground"}`}
            onClick={() => setSettingsTab("relays")}
          >
            Relays
          </span>
          <span
            className={`text-secondary-foreground flex items-center rounded-md px-2 py-1.5 text-sm font-medium ${settingsTab === "notebooks" && "bg-accent/80 text-secondary-foreground"}`}
            onClick={() => setSettingsTab("notebooks")}
          >
            Notebooks
          </span>
          <span
            className={`text-secondary-foreground flex items-center rounded-md px-2 py-1.5 text-sm font-medium ${settingsTab === "sync" && "bg-accent/80 text-secondary-foreground"}`}
            onClick={() => setSettingsTab("sync")}
          >
            Sync
          </span>
        </div>
        <div className="flex w-full flex-col">
          {settingsTab === "profile" && <ProfileSettings />}
          {settingsTab === "notebooks" && <NotebookSettings />}
          {settingsTab === "relays" && relays && (
            <RelaySettings relays={relays} />
          )}
          {settingsTab === "sync" && <SyncSettings syncConfig={syncConfig.data} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
