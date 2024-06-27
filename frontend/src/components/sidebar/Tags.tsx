import { TagsIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import Tag from "./Tag";

export default function AllNotes() {
  const data = [
    { id: "1", name: "Work" },
    { id: "2", name: "Personal" },
    { id: "3", name: "Important" },
    { id: "4", name: "Urgent" },
  ];

  return (
    <Accordion type="single" collapsible defaultValue="item-1">
      <AccordionItem className="border-none" value="item-1">
        <AccordionTrigger>
          <div className="flex pl-2 text-muted-foreground">
            <TagsIcon className="h-[1.2rem] w-[1.2rem]" />
            <span className="ml-1">Tags</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {data?.map((tag) => <Tag key={tag.id} tag={tag} />)}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
