import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

import { useUIStore } from "@/features/settings/store/use-ui-store";

import { SettingRow } from "./setting-row";

type AppStatus = {
  version: string;
  appDatabasePath: string;
  accountPath: string;
  databasePath: string;
  attachmentsPath: string;
  themesPath: string;
  activeNpub: string;
};

type ThemeSummary = {
  id: string;
  name: string;
};

export function GeneralSettings() {
  const themeName = useUIStore((s) => s.themeName);
  const setThemeName = useUIStore((s) => s.setThemeName);

  const { data, isLoading } = useQuery({
    queryKey: ["app_status"],
    queryFn: () => invoke<AppStatus>("app_status"),
  });

  const { data: themes = [] } = useQuery({
    queryKey: ["themes"],
    queryFn: () => invoke<ThemeSummary[]>("list_themes"),
  });

  if (isLoading || !data) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        Loading...
      </div>
    );
  }

  const items = [
    { label: "Version", value: data.version },
    { label: "Active Npub", value: data.activeNpub },
    { label: "App DB", value: data.appDatabasePath },
    { label: "Account", value: data.accountPath },
    { label: "Database", value: data.databasePath },
    { label: "Attachments", value: data.attachmentsPath },
    { label: "Themes", value: data.themesPath },
  ];

  return (
    <div className="space-y-8">
      <div>
        <SettingRow
          label="Theme"
          description="Choose a color theme"
          border={false}
        >
          <select
            className="bg-muted text-foreground rounded-md border px-2 py-1 text-sm outline-none"
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
          >
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </SettingRow>
      </div>

      <div>
        <h3 className="mb-4 text-sm font-medium">About</h3>
        <dl className="space-y-3">
          {items.map((item) => (
            <div key={item.label} className="flex gap-4 text-sm">
              <dt className="text-muted-foreground w-28 shrink-0">
                {item.label}
              </dt>
              <dd className="break-all">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
