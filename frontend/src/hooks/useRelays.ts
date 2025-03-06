import { useQuery } from "@tanstack/react-query";
import { type Relay } from "&/comet/backend/models/models";
import { AppService } from "&/comet/backend/service";

async function fetchRelays() {
  try {
    const relays = await AppService.GetAllRelays();
    if (relays?.every((relay) => relay === null)) {
      return null;
    }
    return (
      (relays?.filter((relay) => relay !== null)) ?? ([] as Relay[])
    );
  } catch (e) {
    console.error("Error fetching active user:", e);
    return null;
  }
}

export const useRelays = () => {
  return useQuery({
    queryKey: ["relays"],
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    queryFn: fetchRelays,
  });
};
