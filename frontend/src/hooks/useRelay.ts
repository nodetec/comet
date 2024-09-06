import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Events } from "@wailsio/runtime";
import { WailsEvent } from "@wailsio/runtime/types/events";

const useRelay = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleRelayFormSave = (_: WailsEvent) => {
      void queryClient.invalidateQueries({
        queryKey: ["relay"],
      });
    };

    Events.On("relayFormSave", handleRelayFormSave);

    return () => {
      Events.Off("relayFormSave");
    };
  }, []);
};

export default useRelay;
