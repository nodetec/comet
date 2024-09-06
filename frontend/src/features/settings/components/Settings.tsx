import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  Relay,
  RelayService,
  SettingService,
} from "&/github.com/nodetec/captains-log/service";

import EditorSettings from "./EditorSettings";
import GeneralSettings from "./GeneralSettings";
import { NostrSettings } from "./NostrSettings";

type Tab = "General" | "Editor" | "Profile" | "Nostr";

type NostrFormValues = {
  relays: {
    Url: string;
    Read: boolean;
    Write: boolean;
    Sync: boolean;
  }[];
};

function formatRelayData(relayData: Relay[]) {
  const relayObj: NostrFormValues = {
    relays: [{ Url: "", Read: false, Write: false, Sync: false }],
  };

  const formattedRelayData = relayData.map((relay) => {
    return {
      Url: relay.Url,
      Read: relay.Read,
      Write: relay.Write,
      Sync: relay.Sync,
    };
  });

  relayObj.relays = formattedRelayData;

  return relayObj;
}

export default function Settings() {
  const [currentTab, setCurrentTab] = useState<Tab>("General");

  const handleCurrentTabOnClick = (tab: Tab) => {
    setCurrentTab(tab);
  };

  // TODO
  // Where should the errors and loading be taken of?
  async function fetchSettings() {
    const settings = await SettingService.GetAllSettings();
    return settings;
  }

  const { data: settingsData } = useQuery({
    queryKey: ["settings"],
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    // gcTime: Infinity,
    // staleTime: Infinity,
    queryFn: () => fetchSettings(),
  });

  async function fetchRelays() {
    const relays = await RelayService.ListRelays();
    return formatRelayData(relays);
  }

  const { data: relayData, isSuccess } = useQuery({
    queryKey: ["relays"],
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    // gcTime: Infinity,
    // staleTime: Infinity,
    queryFn: () => fetchRelays(),
  });

  return (
    <>
      <div className="flex min-h-full min-w-52 max-w-52 flex-col gap-y-2 overflow-hidden border-r bg-secondary pl-4 pr-4 pt-6 text-sm text-muted-foreground">
        <span
          className={`flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm font-medium text-secondary-foreground ${currentTab === "General" && "bg-muted text-secondary-foreground"}`}
          onClick={() => handleCurrentTabOnClick("General")}
        >
          General
        </span>
        <span
          className={`flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm font-medium text-secondary-foreground ${currentTab === "Editor" && "bg-muted text-secondary-foreground"}`}
          onClick={() => handleCurrentTabOnClick("Editor")}
        >
          Editor
        </span>
        <span
          className={`flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm font-medium text-secondary-foreground ${currentTab === "Nostr" && "bg-muted text-secondary-foreground"}`}
          onClick={() => handleCurrentTabOnClick("Nostr")}
        >
          Nostr
        </span>
        {/* <span>Support</span> */}
        {/* <span>Donate</span> */}
      </div>

      {settingsData && relayData && isSuccess && (
        <div className="w-full overflow-auto px-12">
          {currentTab === "General" && <GeneralSettings />}
          {currentTab === "Editor" && (
            <EditorSettings settings={settingsData} />
          )}
          {/* {currentTab === "Profile" && <ProfileSettings />} */}
          {currentTab === "Nostr" && <NostrSettings relayData={relayData} />}
        </div>
      )}
    </>
  );
}
