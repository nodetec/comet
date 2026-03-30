import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { pubkeyToNpub, shortNpub } from "~/lib/pubkeys";
import { cn } from "~/lib/utils";

type PubkeyValueProps = {
  pubkey: string;
  variant?: "text" | "badge";
  className?: string;
  textClassName?: string;
};

export function PubkeyValue({
  pubkey,
  variant = "text",
  className,
  textClassName,
}: PubkeyValueProps) {
  const [open, setOpen] = useState(false);
  const npub = pubkeyToNpub(pubkey);
  const label = shortNpub(pubkey);

  async function copyValue(value: string, kind: "npub" | "hex") {
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${kind}`);
    setOpen(false);
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {variant === "badge" ? (
        <Badge
          variant="secondary"
          className={cn("max-w-full font-mono text-xs", textClassName)}
          title={npub}
        >
          {label}
        </Badge>
      ) : (
        <span className={cn("font-mono text-xs", textClassName)} title={npub}>
          {label}
        </span>
      )}

      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Copy identity"
            aria-label="Copy identity"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem onClick={() => copyValue(npub, "npub")}>
            <KeyRound className="mr-2 h-4 w-4" />
            Copy npub
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => copyValue(pubkey, "hex")}>
            <Copy className="mr-2 h-4 w-4" />
            Copy hex
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
