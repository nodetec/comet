import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Events } from "@wailsio/runtime";
import { WailsEvent } from "@wailsio/runtime/types/events";

const useSettingsRefresh = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleSettingsUpdated = (_: WailsEvent) => {
      void queryClient.invalidateQueries({
        queryKey: ["settings"],
      });
    };

    Events.On("settingsChanged", handleSettingsUpdated);

    return () => {
      Events.Off("settingsChanged");
    };
  }, []);
};

export default useSettingsRefresh;
