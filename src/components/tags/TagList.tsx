import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@radix-ui/react-accordion";
import { useQuery } from "@tanstack/react-query";
import { listTags } from "~/api";
import { ScrollArea } from "~/components/ui/scroll-area";
import { type Tag } from "~/types";

import TagItem from "./TagItem";

export default function TagList() {
  async function fetchTags() {
    const apiResponse = await listTags();
    console.log(apiResponse);
    if (apiResponse.data) {
      return apiResponse.data;
    }
  }

  const { data: tagsData, error } = useQuery({
    queryKey: ["tags"],
    queryFn: fetchTags,
  });

  return (
    <ScrollArea className="flex h-full flex-col p-2">
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Tags</AccordionTrigger>
          <AccordionContent>
            {tagsData &&
              tagsData.map((tag) => <TagItem key={tag.id} tag={tag} />)}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </ScrollArea>
  );
}
