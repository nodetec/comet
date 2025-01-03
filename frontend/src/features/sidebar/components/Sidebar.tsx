import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Settings } from "~/features/settings";
import { useTags } from "~/hooks/useTags";
import { cn } from "~/lib/utils";
import { useAppState } from "~/store";
import { Settings2Icon, UserCircleIcon } from "lucide-react";

import { AllNotesBtn } from "./AllNotesBtn";
import { NewNotebookDialog } from "./NewNotebookDialog";
import { Notebooks } from "./Notebooks";
import { Tags } from "./Tags";
import { TrashBtn } from "./TrashBtn";

export function Sidebar() {
  const setSettingsTab = useAppState((state) => state.setSettingsTab);
  const lastTagVisible = useAppState((state) => state.lastTagVisible);
  const tags = useTags();
  const tagsCount = tags.data?.length ?? 0;

  return (
    <div className="flex h-full flex-col justify-between bg-secondary pt-2">
      <div className="flex justify-end gap-x-4 pb-4 pr-4">
        <div className="flex justify-end gap-1">
          <Settings>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSettingsTab("profile")}
            >
              <UserCircleIcon />
            </Button>
          </Settings>
          <Settings>
            <Button type="button" variant="ghost" size="icon">
              <Settings2Icon />
            </Button>
          </Settings>
        </div>
      </div>

      <ScrollArea
        className={cn(
          "flex h-full flex-col gap-y-2",
          !lastTagVisible && tagsCount > 0 && "border-b",
        )}
      >
        <div className="flex flex-col gap-y-1 px-3">
          <Accordion
            className="my-0 py-0"
            type="single"
            collapsible
            defaultValue="item-1"
          >
            <AccordionItem className="border-none" value="item-1">
              <AccordionTrigger className="pb-1.5 pt-0 hover:no-underline">
                <div className="flex items-center text-secondary-foreground">
                  <div className="ml-1 text-xs text-muted-foreground">
                    Notes
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="flex flex-col pb-0 pl-1">
                <AllNotesBtn />
                <TrashBtn />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Notebooks />
          <Tags />
        </div>
      </ScrollArea>
      <div>
        <NewNotebookDialog />
      </div>
    </div>
  );
}
