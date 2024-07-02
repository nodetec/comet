import * as React from "react";

// import { useEffect } from "react";

import { useQuery } from "@tanstack/react-query";
import { NotebookService } from "&/github.com/nodetec/captains-log/service";
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
import { Check, ChevronsUpDown, NotebookIcon, PlusIcon } from "lucide-react";

export function NotebookComboBox() {
  const { activeNotebook } = useAppState();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");

  // const { feedType, setFeedType } = useAppState();

  // function handleAllNotesClick() {
  //   setFeedType("all");
  // }

  async function fetchNotebooks() {
    const notebooks = await NotebookService.ListNotebooks();
    console.log("notebooks", notebooks);
    return notebooks;
  }

  const { data } = useQuery({
    queryKey: ["notebooks"],
    queryFn: () => fetchNotebooks(),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="combobox"
          aria-expanded={open}
          className="hover:bg-muted-hover flex w-full cursor-pointer items-center justify-between rounded-md p-2 text-sm font-medium text-muted-foreground transition-colors"
        >
          {activeNotebook === undefined ? (
            <span className="flex items-center">
              <NotebookIcon className="mr-1.5 h-[1.2rem] w-[1.2rem]" />
              {/* <NotepadText className="mr-1 h-4" /> */}
              Notebooks
            </span>
          ) : (
            activeNotebook.Name
          )}
          <ChevronsUpDown className="h-4 w-4" />
        </span>
      </PopoverTrigger>
      <PopoverContent className="popover-content-width-full p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No framework found.</CommandEmpty>
            <CommandGroup>
              <div className="my-1"></div>
              <CommandItem
                value={"_New Notebook_"}
                onSelect={(currentValue) => {
                  setValue(currentValue === value ? "" : currentValue);
                  setOpen(false);
                }}
              >
                <PlusIcon className="mr-2 h-4" />
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
