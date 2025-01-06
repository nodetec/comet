import { Dialog, DialogContent, DialogTrigger } from "~/components/ui/dialog";
import { useRelays } from "~/hooks/useRelays";
import { useAppState } from "~/store";

import { NotebookSettings } from "./NotebookSettings";
// import { EditorSettings } from "./EditorSettings";
import { ProfileSettings } from "./ProfileSettings";
import { RelaySettings } from "./RelaySettings";

type Props = {
  children: React.ReactNode;
};

export function Settings({ children }: Props) {
  const settingsTab = useAppState((state) => state.settingsTab);
  const setSettingsTab = useAppState((state) => state.setSettingsTab);

  const relays = useRelays();

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex h-[85%] max-h-[60rem] w-[90%] max-w-[70rem] select-none overflow-hidden border border-accent p-0">
        <div className="flex min-h-full min-w-64 max-w-64 flex-col gap-y-2 overflow-hidden border-r bg-secondary pl-4 pr-4 pt-6 text-sm text-muted-foreground">
          <span
            className={`flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm font-medium text-secondary-foreground ${settingsTab === "profile" && "bg-muted text-secondary-foreground"}`}
            onClick={() => setSettingsTab("profile")}
          >
            Profile
          </span>
          <span
            className={`flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm font-medium text-secondary-foreground ${settingsTab === "relays" && "bg-muted text-secondary-foreground"}`}
            onClick={() => setSettingsTab("relays")}
          >
            Relays
          </span>
          <span
            className={`flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm font-medium text-secondary-foreground ${settingsTab === "notebooks" && "bg-muted text-secondary-foreground"}`}
            onClick={() => setSettingsTab("notebooks")}
          >
            Notebooks
          </span>
          {/* <span
          className={`flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm font-medium text-secondary-foreground ${settingsTab === "editor" && "bg-muted text-secondary-foreground"}`}
          onClick={() => setSettingsTab("editor")}
        >
          Editor
        </span> */}
        </div>
        <div className="flex w-full flex-col">
          {settingsTab === "profile" && <ProfileSettings />}
          {settingsTab === "notebooks" && <NotebookSettings />}
          {settingsTab === "relays" && relays.data && (
            <RelaySettings relays={relays.data} />
          )}
          {/* {settingsTab === "editor" && <EditorSettings />} */}
        </div>
      </DialogContent>
    </Dialog>
  );
}
