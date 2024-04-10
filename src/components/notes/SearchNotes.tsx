import { MagnifyingGlassIcon } from "@radix-ui/react-icons";

import { Input } from "../ui/input";

export default function SearchNotes() {
  return (
    <div className="flex items-center py-2 pr-4">
      <MagnifyingGlassIcon className="pointer-events-none relative left-8 top-2.5 -translate-y-1/2 transform h-[1.2rem] w-[1.2rem]" />
      <Input placeholder="Search..." className="pl-10 focus-visible:ring-muted-foreground/30" />
    </div>
  );
}
