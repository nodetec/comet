import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EllipsisVertical } from "lucide-react";

import { StatsDialog } from "./StatsDialog";

export function EditorDropdown() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleStatsClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setMenuOpen(false); // Close the dropdown menu
    setDialogOpen(true); // Open the stats dialog
  };

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(isOpen) => setMenuOpen(isOpen)}
      >
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
          <DropdownMenuItem onClick={handleStatsClick}>Stats</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <StatsDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
