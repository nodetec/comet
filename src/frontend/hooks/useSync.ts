import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";

export const useSync = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const appSynced = (_: Electron.IpcRendererEvent) => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      const queryKey = ["note"];
      void queryClient.resetQueries({ queryKey });
    };

    const cleanup = window.api.onSync(appSynced);

    return cleanup;
  }, [queryClient]);
};
