import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { useNotebooks } from "~/hooks/useNotebooks";

import { NotebookBtn } from "./NotebookBtn";

export function Notebooks() {
  const notebooks = useNotebooks(false);

  if (notebooks.status === "pending") {
    return undefined;
  }

  if (notebooks.status === "error") {
    return <div>Error fetching notebooks</div>;
  }

  return (
    <Accordion type="single" collapsible defaultValue="notebooks">
      <AccordionItem value="notebooks">
        <AccordionTrigger className="ml-1 flex items-center pt-0 pb-1.5 text-xs">
          Notebooks
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-0.5 pb-0">
          {notebooks.data?.map((notebook) => (
            <NotebookBtn notebook={notebook} key={notebook._id} />
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
