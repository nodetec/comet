import { useQuery } from "@tanstack/react-query";

async function fetchSyncConfig() {
  const syncConfig = await window.api.getSyncConfig();
  console.log("syncConfig", syncConfig);
  return syncConfig ?? null;
}

export const useSyncConfig = () => {
  return useQuery({
    queryKey: ["syncConfig"],
    refetchOnWindowFocus: false,
    queryFn: fetchSyncConfig,
  });
};
