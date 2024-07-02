import * as React from "react";
import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { NotebookService } from "&/github.com/nodetec/captains-log/service";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useAppState } from "~/store";
// import { cn } from "~/lib/utils";
import { Check, ChevronsUpDown, PlusIcon } from "lucide-react";

import { Separator } from "../ui/separator";
import AllNotes from "./AllNotes";

export function NotebookComboBox() {
  const { activeNotebook } = useAppState();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");

  async function fetchNotebooks() {
    const notebooks = await NotebookService.ListNotebooks();
    console.log("notebooks", notebooks);
    return notebooks;
  }

  const { data } = useQuery({
    queryKey: ["notebooks"],
    queryFn: () => fetchNotebooks(),
  });

  useEffect(() => {
    console.log("data", data);
  }, [data]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="mb-2 w-full justify-between"
        >
          {activeNotebook === undefined ? "All Notes" : activeNotebook.Name}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="popover-content-width-full p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No framework found.</CommandEmpty>
            <CommandGroup>
              <div className="my-1"></div>
              <CommandItem
                value={"All Notes"}
                onSelect={(currentValue) => {
                  setValue(currentValue === value ? "" : currentValue);
                  setOpen(false);
                }}
              >
                {activeNotebook === undefined && (
                  <Check className="mr-2 h-4 w-4" />
                )}
                All Notes
              </CommandItem>
              <CommandItem
                value={"_New Notebook_"}
                onSelect={(currentValue) => {
                  setValue(currentValue === value ? "" : currentValue);
                  setOpen(false);
                }}
              >
                <PlusIcon className="mr-2 h-4 w-4" />
                New Notebook
              </CommandItem>
              <div className="my-1 border-b border-primary/20"></div>

              {data?.map((notebook) => (
                <CommandItem
                  key={notebook.ID}
                  value={notebook.Name}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  {activeNotebook?.ID === notebook.ID && (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  {notebook.Name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
