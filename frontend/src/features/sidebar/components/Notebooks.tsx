import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { useNotebooks } from "~/hooks/useNotebooks";

import { NotebookBtn } from "./NotebookBtn";

export function Notebooks() {
  const { data, status } = useNotebooks(true);

  if (status === "pending") {
    return undefined;
  }

  if (status === "error") {
    return <div>Error fetching notebooks</div>;
  }

  return (
    <Accordion
      className="my-0 py-0"
      type="single"
      collapsible
      defaultValue="item-1"
    >
      <AccordionItem className="border-none" value="item-1">
        <AccordionTrigger className="pb-1.5 pt-2.5 hover:no-underline">
          <div className="flex items-center text-secondary-foreground">
            <div className="ml-1 text-xs text-muted-foreground">Notebooks</div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col pb-0 pl-1 gap-0.5">
          {data?.map((notebook) => (
            <NotebookBtn notebook={notebook} key={notebook.ID} />
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
