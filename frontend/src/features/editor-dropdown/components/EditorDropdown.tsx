import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EllipsisVertical } from "lucide-react";

export function EditorDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          id="editor-header-ellipsis-vertical-btn"
          name="editor-header-ellipsis-vertical-btn"
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
        >
          <EllipsisVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>Stats</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
