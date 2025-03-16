import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { ScrollArea } from "~/components/ui/scroll-area-old";
import { useTags } from "~/hooks/useTags";
import { cn } from "~/lib/utils";
import { useAppState } from "~/store";

import { AllNotesBtn } from "./AllNotesBtn";
import { Notebooks } from "./Notebooks";
import { Tags } from "./Tags";
import { TrashNotesBtn } from "./TrashNotesBtn";

export function SidebarNav() {
  const lastTagVisible = useAppState((state) => state.lastTagVisible);
  const tags = useTags();

  return (
    <ScrollArea
      type="scroll"
      className={cn(
        "flex h-full flex-col gap-y-2",
        !lastTagVisible && (tags.data?.length ?? 0) > 0 && "border-b",
      )}
    >
      <div className="flex flex-col gap-y-1 px-3">
        <Accordion type="single" collapsible defaultValue="notes">
          <AccordionItem value="notes">
            <AccordionTrigger className="ml-1 flex items-center pt-0 pb-1.5 text-xs">
              Notes
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-0.5 pb-0">
              <AllNotesBtn />
              <TrashNotesBtn />
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <Notebooks />
        <Tags />
      </div>
    </ScrollArea>
  );
}
