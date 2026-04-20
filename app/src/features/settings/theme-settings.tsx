import { useQuery } from "@tanstack/react-query";

import { getAppStatus, listThemes } from "@/shared/api/invoke";
import { useThemeName, useUIActions } from "@/shared/stores/use-ui-store";
import { SYSTEM_THEME_ID } from "@/shared/theme/schema";

import { SettingRow } from "./setting-row";

export function ThemeSettings() {
  const themeName = useThemeName();
  const { setThemeName } = useUIActions();

  const { data: themes = [] } = useQuery({
    queryKey: ["themes"],
    queryFn: listThemes,
  });

  const { data: appStatus } = useQuery({
    queryKey: ["app_status"],
    queryFn: getAppStatus,
  });

  return (
    <div className="space-y-8">
      <div>
        <SettingRow
          label="Theme"
          description="Choose a color theme or follow your system setting"
          border={false}
        >
          <select
            className="bg-muted text-foreground rounded-md border px-2 py-1 text-sm outline-none"
            value={themeName ?? SYSTEM_THEME_ID}
            onChange={(e) =>
              setThemeName(
                e.target.value === SYSTEM_THEME_ID ? null : e.target.value,
              )
            }
          >
            <option value={SYSTEM_THEME_ID}>System</option>
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </SettingRow>
      </div>

      <div>
        <h3 className="mb-4 text-sm font-medium">Theme Files</h3>
        <dl className="space-y-3">
          <div className="flex gap-4 text-sm">
            <dt className="text-muted-foreground w-28 shrink-0">Directory</dt>
            <dd className="break-all">
              {appStatus?.themesPath ?? "Loading theme directory…"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
