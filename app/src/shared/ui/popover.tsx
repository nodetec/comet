import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { type ComponentPropsWithoutRef } from "react";

import { cn } from "@/shared/lib/utils";

const PopoverRoot = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverClose = PopoverPrimitive.Close;

function PopoverPopup({
  className,
  sideOffset = 6,
  side = "bottom",
  align = "end",
  ...props
}: ComponentPropsWithoutRef<typeof PopoverPrimitive.Popup> &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "sideOffset" | "side">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-popup"
          className={cn(
            "bg-card text-card-foreground border-accent w-72 rounded-lg border shadow-lg transition-all duration-150 outline-none data-[closed]:scale-95 data-[closed]:opacity-0 data-[open]:scale-100 data-[open]:opacity-100",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { PopoverRoot, PopoverTrigger, PopoverPopup, PopoverClose };
