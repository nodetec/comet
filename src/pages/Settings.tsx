import { useState } from "react";

import EditorSettings from "~/components/settings/EditorSettings";
import GeneralSettings from "~/components/settings/GeneralSettings";
import NostrSettings from "~/components/settings/NostrSettings";
import ThemeSettings from "~/components/settings/ThemeSettings";

type Tab = "General" | "Editor" | "Theme" | "Nostr";

export default function Settings() {
  const [currentTab, setCurrentTab] = useState<Tab>("General");

  const handleCurrentTabOnClick = (tab: Tab) => {
    setCurrentTab(tab);
  };

  return (
    <div className="flex h-full flex-col p-8">
      <h1 className="mb-8 border-b pb-4 text-xl font-bold">Settings</h1>
      <div className="flex gap-x-20 overflow-auto">
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
            className={`cursor-pointer ${currentTab === "Nostr" ? "font-semibold text-primary" : ""}`}
            onClick={() => handleCurrentTabOnClick("Nostr")}
          >
            Nostr
          </span>
          {/* <span>Support</span> */}
          {/* <span>Donate</span> */}
        </nav>

        <div className="w-full overflow-auto">
          {currentTab === "General" && <GeneralSettings />}
          {currentTab === "Editor" && <EditorSettings />}
          {currentTab === "Theme" && <ThemeSettings />}
          {currentTab === "Nostr" && <NostrSettings />}
        </div>
      </div>
    </div>
  );
}
