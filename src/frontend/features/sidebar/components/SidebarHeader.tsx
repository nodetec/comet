import { Button } from "~/components/ui/button";
import { Settings } from "~/features/settings";
import { Settings2Icon, UserCircleIcon } from "lucide-react";

export function SidebarHeader() {
  return (
    <header className="draggable flex justify-end gap-1 px-4 pt-2 pb-4">
      <Settings>
        <Button type="button" variant="ghost" size="icon">
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
