import { GearIcon } from "@radix-ui/react-icons";
import * as wails from "@wailsio/runtime";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "../ui/button";

export default function Login() {
  const handleOpenSettings = () => {
    wails.Events.Emit({ name: "open-settings-window", data: "" });
  };

  return (
    <div className="flex items-center gap-4 border-t bg-black/10 py-2">
      <div className="flex w-full items-center justify-between">
        <Button
          variant="ghost"
          className="my-0 flex items-center gap-x-1 text-muted-foreground hover:bg-background hover:text-white"
        >
          <p className="text-sm">Login</p>
          <ArrowRightIcon className="h-3 w-3" />
        </Button>

        <GearIcon
          onClick={handleOpenSettings}
          className="mr-3 h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground"
        />
      </div>
    </div>
  );
}
