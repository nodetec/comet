import { useEffect } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Events } from "@wailsio/runtime";
import { WailsEvent } from "@wailsio/runtime/types/events";
import { useAppState } from "~/store";

const useTagMenu = () => {
  const queryClient = useQueryClient();

  const activeTag = useAppState((state) => state.activeTag);
  const setActiveTag = useAppState((state) => state.setActiveTag);
  const setFeedType = useAppState((state) => state.setFeedType);

  useEffect(() => {
    const handleTagDeleted = (event: WailsEvent) => {
      if (activeTag?.ID === event.data) {
        console.log("setting active tag to undefined");
        setActiveTag(undefined);
        setFeedType("all");
      }
      void queryClient.invalidateQueries({
        queryKey: ["tags"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["note_tags"],
      });
    };

    Events.On("tagDeleted", handleTagDeleted);

    return () => {
      Events.Off("tagDeleted");
    };
  }, [activeTag, setActiveTag, queryClient]);
};

export default useTagMenu;
