import { GearIcon } from "@radix-ui/react-icons";
import * as wails from "@wailsio/runtime";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "../ui/button";

export default function Login() {
  const handleOpenSettings = () => {
    wails.Events.Emit({ name: "open-settings-window", data: "" });
  };

  return (
    <div className="flex items-center gap-4 border-t bg-black/10 p-2">
      <div className="flex w-full items-center justify-between">
        <Button 
          variant="ghost"
          className="flex items-center gap-x-1 my-0">
          <p className="text-sm text-muted-foreground/90">Login</p>
          <ArrowRightIcon className="h-3 w-3 text-muted-foreground/90" />
        </Button>

        <GearIcon
          onClick={handleOpenSettings}
          className="h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground"
        />
      </div>
    </div>
  );
}
