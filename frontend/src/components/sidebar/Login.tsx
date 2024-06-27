import { GearIcon } from "@radix-ui/react-icons";
import { ArrowRightIcon } from "lucide-react";

export default function Login() {
  return (
    <div className="flex items-center gap-4 border-t bg-black/10 p-4">
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-x-1">
          <p className="text-muted-foreground/90">Login</p>
          <ArrowRightIcon className="h-4 w-4 text-muted-foreground/90" />
        </div>
      </div>
    </div>
  );
}
