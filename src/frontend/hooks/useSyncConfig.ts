import { useQuery } from "@tanstack/react-query";

async function fetchSyncConfig() {
  const syncConfig = await window.api.getSyncConfig();
  return syncConfig ?? null;
}

export const useSyncConfig = () => {
  return useQuery({
    queryKey: ["syncConfig"],
    refetchOnWindowFocus: false,
    queryFn: fetchSyncConfig,
  });
};
