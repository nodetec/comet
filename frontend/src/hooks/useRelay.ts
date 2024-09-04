import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Events } from "@wailsio/runtime";
import { WailsEvent } from "@wailsio/runtime/types/events";

const useRelay = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleRelaysFormSave = (_: WailsEvent) => {
      void queryClient.invalidateQueries({
        queryKey: ["relays"],
      });
    };

    Events.On("relaysFormSave", handleRelaysFormSave);

    return () => {
      Events.Off("relaysFormSave");
    };
  }, []);
};

export default useRelay;
