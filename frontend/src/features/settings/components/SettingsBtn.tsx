import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Settings2 } from "lucide-react";
import { Settings } from "./Settings";

export function SettingsBtn() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
        >
          <Settings2 className="h-5 w-5 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85%] min-h-[85%] min-w-[90%] max-w-[90%] border border-accent p-0">
        <DialogHeader className="hidden">
          <DialogTitle className="pl-8 pt-8">Settings</DialogTitle>
        </DialogHeader>
        <Settings />
      </DialogContent>
    </Dialog>
  );
}
