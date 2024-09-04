import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  RelayService,
  SettingService,
} from "&/github.com/nodetec/captains-log/service";

import EditorSettings from "./components/EditorSettings";
import GeneralSettings from "./components/GeneralSettings";
// import ProfileSettings from "./components/ProfileSettings";
import { NostrSettings } from "./components/NostrSettings";

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
    queryFn: () => fetchSettings(),
  });

  async function fetchRelays() {
    const relays = await RelayService.ListRelays();
    return relays;
  }

  const { data: relayData } = useQuery({
    queryKey: ["relays"],
    queryFn: () => fetchRelays(),
  });

  return (
    <div className="h-dvh w-dvw">
      <div className="flex h-full w-full flex-col pt-10">
        <h1 className="mb-8 border-b px-8 pb-4 text-xl font-bold">Settings</h1>
        <div className="flex gap-x-20 overflow-auto pl-8">
          <nav className="flex flex-col gap-y-4 text-sm text-muted-foreground">
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
            {/* <span */}
            {/*   className={`cursor-pointer ${currentTab === "Profile" ? "font-semibold text-primary" : ""}`} */}
            {/*   onClick={() => handleCurrentTabOnClick("Profile")} */}
            {/* > */}
            {/*   Profile */}
            {/* </span> */}
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
            <div className="w-full overflow-auto pb-8 pr-8">
              {currentTab === "General" && <GeneralSettings />}
              {currentTab === "Editor" && (
                <EditorSettings settings={settingsData} />
              )}
              {/* {currentTab === "Profile" && <ProfileSettings />} */}
              {currentTab === "Nostr" && (
                <NostrSettings relayData={relayData} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
