import { useQuery } from "@tanstack/react-query";
import { getProfileEvent } from "~/lib/nostr/getProfileEvent";
import { type Event } from "nostr-tools";
import { type Relay } from "&/comet/backend/models/models";

export const useProfileEvent = (
  relays: Relay[] | null | undefined,
  publicKey: string | undefined,
) => {
  return useQuery<Event | null>({
    queryKey: ["profile", publicKey],
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: Infinity,
    gcTime: Infinity,
    enabled: !!publicKey && !!relays?.length,
    queryFn: () => getProfileEvent(relays, publicKey),
  });
};
