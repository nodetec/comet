import { useQuery } from "@tanstack/react-query";
import { TagService } from "&/github.com/nodetec/captains-log/service";
import { TagsIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import TagItem from "./TagItem";

export default function Tags() {
  const { isPending, data } = useQuery({
    queryKey: ["tags"],
    queryFn: () => fetchTags(),
  });

  async function fetchTags() {
    const tags = await TagService.ListTags();
    return tags;
  }

  if (isPending) return <div>Loading...</div>;

  return (
    <Accordion type="single" collapsible defaultValue="item-1">
      <AccordionItem className="border-none" value="item-1">
        <AccordionTrigger>
          <div className="flex pl-2 pr-2 text-muted-foreground">
            <TagsIcon className="h-[1.2rem] w-[1.2rem]" />
            <span className="ml-1">Tags</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {data?.map((tag) => <TagItem key={tag.ID} tag={tag} />)}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
