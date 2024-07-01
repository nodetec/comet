import { useState } from "react";

import EditorSettings from "./components/EditorSettings";
import GeneralSettings from "./components/GeneralSettings";
import ProfileSettings from "./components/ProfileSettings";
import RelaySettings from "./components/RelaySettings";
import ThemeSettings from "./components/ThemeSettings";

type Tab = "General" | "Editor" | "Theme" | "Profile" | "Relays";

export default function Settings() {
  const [currentTab, setCurrentTab] = useState<Tab>("General");

  const handleCurrentTabOnClick = (tab: Tab) => {
    setCurrentTab(tab);
  };

  return (
    <div className="h-dvh w-dvw">
      <div className="flex h-full w-full flex-col pt-8">
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
            <span
              className={`cursor-pointer ${currentTab === "Theme" ? "font-semibold text-primary" : ""}`}
              onClick={() => handleCurrentTabOnClick("Theme")}
            >
              Theme
            </span>
            <span
              className={`cursor-pointer ${currentTab === "Profile" ? "font-semibold text-primary" : ""}`}
              onClick={() => handleCurrentTabOnClick("Profile")}
            >
              Profile
            </span>
            <span
              className={`cursor-pointer ${currentTab === "Relays" ? "font-semibold text-primary" : ""}`}
              onClick={() => handleCurrentTabOnClick("Relays")}
            >
              Relays
            </span>
            {/* <span>Support</span> */}
            {/* <span>Donate</span> */}
          </nav>

          <div className="w-full overflow-auto pb-8 pr-8">
            {currentTab === "General" && <GeneralSettings />}
            {currentTab === "Editor" && <EditorSettings />}
            {currentTab === "Theme" && <ThemeSettings />}
            {currentTab === "Profile" && <ProfileSettings />}
            {currentTab === "Relays" && <RelaySettings />}
          </div>
        </div>
      </div>
    </div>
  );
}
