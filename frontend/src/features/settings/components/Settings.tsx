import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  RelayService,
  SettingService,
} from "&/github.com/nodetec/captains-log/service";

import EditorSettings from "./EditorSettings";
import GeneralSettings from "./GeneralSettings";
import { NostrSettings } from "./NostrSettings";

type Tab = "General" | "Editor" | "Profile" | "Nostr";

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
    gcTime: Infinity,
    staleTime: Infinity,
    queryFn: () => fetchSettings(),
  });

  async function fetchRelays() {
    const relays = await RelayService.ListRelays();
    console.log("fetchRelays ", relays);
    return relays;
  }

  const { data: relayData } = useQuery({
    queryKey: ["relays"],
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    gcTime: Infinity,
    staleTime: Infinity,
    queryFn: () => fetchRelays(),
  });

  return (
    <>
      <nav className="flex min-h-full min-w-48 max-w-48 flex-col gap-y-4 overflow-hidden border-r bg-secondary pl-8 pr-32 pt-6 text-sm text-muted-foreground">
        <span
          className={`cursor-pointer ${currentTab === "General" ? "font-semibold text-primary" : ""}`}
          onClick={() => handleCurrentTabOnClick("General")}
        >
          General
        </span>
        <span
          className={`cursor-pointer ${currentTab === "Editor" ? "font-semibold text-primary" : ""}`}
          onClick={() => handleCurrentTabOnClick("Editor")}
        >
          Editor
        </span>
        <span
          className={`cursor-pointer ${currentTab === "Nostr" ? "font-semibold text-primary" : ""}`}
          onClick={() => handleCurrentTabOnClick("Nostr")}
        >
          Nostr
        </span>
        {/* <span>Support</span> */}
        {/* <span>Donate</span> */}
      </nav>

      {settingsData && relayData && (
        <div className="w-full overflow-auto">
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
