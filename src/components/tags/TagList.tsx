import { useQuery } from "@tanstack/react-query";
import { listTags } from "~/api";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { ScrollArea } from "~/components/ui/scroll-area";
import { TagsIcon } from "lucide-react";

import TagItem from "./TagItem";

export default function TagList() {
  async function fetchTags() {
    const apiResponse = await listTags();
    console.log(apiResponse);
    if (apiResponse.data) {
      return apiResponse.data;
    }
  }

  const { data } = useQuery({
    queryKey: ["tags"],
    queryFn: fetchTags,
  });

  return (
    <ScrollArea className="flex h-full flex-col p-2">
      <Accordion type="single" collapsible defaultValue="item-1">
        <AccordionItem className="border-none" value="item-1">
          <AccordionTrigger>
            <div className="text-muted-foreground flex">
              <TagsIcon className="h-[1.2rem] w-[1.2rem]" />
              <span className="ml-1">Tags</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {data?.map((tag) => <TagItem key={tag.id} tag={tag} />)}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* <Accordion type="single" collapsible className="w-full"> */}
      {/*   <AccordionItem value="item-1"> */}
      {/*     <AccordionTrigger>Is it accessible?</AccordionTrigger> */}
      {/*     <AccordionContent> */}
      {/*       Yes. It adheres to the WAI-ARIA design pattern. */}
      {/*     </AccordionContent> */}
      {/*   </AccordionItem> */}
      {/*   <AccordionItem value="item-2"> */}
      {/*     <AccordionTrigger>Is it styled?</AccordionTrigger> */}
      {/*     <AccordionContent> */}
      {/*       Yes. It comes with default styles that matches the other */}
      {/*       components&apos; aesthetic. */}
      {/*     </AccordionContent> */}
      {/*   </AccordionItem> */}
      {/*   <AccordionItem value="item-3"> */}
      {/*     <AccordionTrigger>Is it animated?</AccordionTrigger> */}
      {/*     <AccordionContent> */}
      {/*       Yes. It's animated by default, but you can disable it if you prefer. */}
      {/*     </AccordionContent> */}
      {/*   </AccordionItem> */}
      {/* </Accordion> */}
    </ScrollArea>
  );
}
