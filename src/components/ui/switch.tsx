import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "bg-input focus-visible:ring-ring/50 data-[checked]:bg-primary inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="bg-foreground pointer-events-none block size-4 rounded-full shadow-sm transition-transform data-[checked]:translate-x-4 data-[unchecked]:translate-x-0.5" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
