import { useQuery } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";

async function fetchRelays() {
  try {
    const relays = await AppService.GetAllRelays();
    console.log("Relays:", relays);
    if (relays?.every((relay) => relay === null)) {
      return null;
    }
    return relays?.filter((relay) => relay !== null) ?? [];
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
