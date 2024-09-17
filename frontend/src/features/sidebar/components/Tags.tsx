import { useQuery } from "@tanstack/react-query";
import {
  NotebookService,
  Tag,
  TagService,
} from "&/github.com/nodetec/comet/service";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { useAppState } from "~/store";
import { TagsIcon } from "lucide-react";
import { TagItem } from "./TagItem";

export function Tags() {
  const activeNotebook = useAppState((state) => state.activeNotebook);

  const { isPending, data } = useQuery({
    queryKey: ["tags", activeNotebook?.ID],
    queryFn: () => fetchTags(),
  });

  async function fetchTags() {
    let tags: Tag[] = [];

    if (!activeNotebook) {
      tags = await TagService.ListTags();
    } else {
      tags = await NotebookService.GetTagsForNotebook(activeNotebook.ID);
    }

    return tags;
  }

  if (isPending) return <div>Loading...</div>;

  return (
    <Accordion type="single" collapsible defaultValue="item-1">
      <AccordionItem className="border-none px-2" value="item-1">
        <AccordionTrigger className="py-1.5">
          <div className="flex items-center text-muted-foreground">
            <TagsIcon className="h-[1.1rem] w-[1.1rem]" />
            <span className="ml-1.5">Tags</span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          {data?.map((tag) => <TagItem key={tag.ID} tag={tag} />)}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
