import React from "react";

import { cn } from "~/lib/utils";

interface SidebarButtonProps {
  onClick: () => void;
  onContextMenu?: (
    event: React.MouseEvent<HTMLDivElement>,
  ) => void | Promise<void>;
  isFocused: boolean;
  isActive: boolean;
  icon: React.ReactElement<React.SVGProps<SVGSVGElement>>;
  label: string;
}

export function SidebarButton({
  onClick,
  onContextMenu,
  isFocused,
  isActive,
  icon,
  label,
}: SidebarButtonProps) {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      data-focused={isFocused}
      className={cn(
        "text-secondary-foreground flex w-full items-center rounded-md px-3 py-1 text-sm select-none",
        isActive && "bg-accent/80",
        "cursor-default data-[focused=true]:bg-blue-500/50",
      )}
    >
      {React.cloneElement(icon, {
        className: cn(
          "h-4 w-4 text-blue-400/90 shrink-0",
          isActive && "data-[focused=true]:text-secondary-foreground",
        ),
      })}
      <div className="ml-2 line-clamp-1 truncate break-all overflow-ellipsis whitespace-break-spaces">
        {label}
      </div>
    </div>
  );
}
