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
      <AccordionItem className="border-none px-2" value="item-1">
        <AccordionTrigger className="py-2">
          <div className="flex text-muted-foreground">
            <TagsIcon className="h-[1.2rem] w-[1.2rem]" />
            <span className="ml-2">Tags</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {data?.map((tag) => <TagItem key={tag.ID} tag={tag} />)}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
