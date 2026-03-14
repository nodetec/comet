import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

type AppStatus = {
  appName: string;
  editor: string;
  storage: string;
  publishing: string;
  updatedAt: string;
};

export function GeneralSettings() {
  const { data, isLoading } = useQuery({
    queryKey: ["app_status"],
    queryFn: () => invoke<AppStatus>("app_status"),
  });

  if (isLoading || !data) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        Loading...
      </div>
    );
  }

  const items = [
    { label: "App", value: data.appName },
    { label: "Editor", value: data.editor },
    { label: "Storage", value: data.storage },
    { label: "Publishing", value: data.publishing },
    { label: "Updated", value: data.updatedAt },
  ];

  return (
    <div>
      <h3 className="mb-4 text-sm font-medium">About</h3>
      <dl className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex gap-4 text-sm">
            <dt className="text-muted-foreground w-24 shrink-0">
              {item.label}
            </dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
