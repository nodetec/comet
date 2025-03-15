import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { useTags } from "~/hooks/useTags";
import { useAppState } from "~/store";
import { useInView } from "react-intersection-observer";

import { Tag } from "./Tag";

// import { TagItem } from "./TagItem";

export function Tags() {
  const tags = useTags();

  const setLastTagVisible = useAppState((state) => state.setLastTagVisible);

  const { ref: lastTagRef } = useInView({
    threshold: 1,
    onChange: (inView) => {
      if (inView) {
        setLastTagVisible(true);
      } else {
        setLastTagVisible(false);
      }
    },
  });

  if (tags.status === "pending") {
    return undefined;
  }

  if (tags.status === "error") {
    return <div>Error fetching tags</div>;
  }

  return (
    <Accordion type="single" collapsible defaultValue="item-1">
      <AccordionItem value="item-1">
        <AccordionTrigger className="pt-3 pb-1.5">
          <div className="flex items-center">
            <div className="ml-1 text-xs">Tags</div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pl-3">
          <div className="flex flex-wrap gap-2 pt-2">
            {tags.data?.map((tag, index) => {
              const isLastTag = index === tags.data.length - 1;
              return (
                <div key={tag} ref={isLastTag ? lastTagRef : null}>
                  <Tag tag={tag} />
                </div>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
