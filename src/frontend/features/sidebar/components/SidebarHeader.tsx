import { Button } from "~/components/ui/button";
import { Settings } from "~/features/settings";
import { useAppState } from "~/store";
import { Settings2Icon, UserCircleIcon } from "lucide-react";

export function SidebarHeader() {
  const setSettingsTab = useAppState((state) => state.setSettingsTab);

  function handleClick() {
    setSettingsTab("profile");
  }

  function handleDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    console.log("double click");
    void window.api.toggleMaximize();
  }

  return (
    <header
      className="draggable flex justify-end gap-1 px-4 pt-2 pb-4"
      onDoubleClick={handleDoubleClick}
    >
      <Settings>
        <Button
          onClick={handleClick}
          onDoubleClick={(e) => e.stopPropagation()}
          type="button"
          variant="ghost"
          size="icon"
        >
          <UserCircleIcon />
        </Button>
      </Settings>
      <Settings>
        <Button type="button" variant="ghost" size="icon">
          <Settings2Icon />
        </Button>
      </Settings>
    </header>
  );
}
