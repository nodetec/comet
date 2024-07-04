import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Notebook } from "&/github.com/nodetec/captains-log/db/models";
import { NotebookService } from "&/github.com/nodetec/captains-log/service";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useAppState } from "~/store";
import { Check, ChevronsUpDown, NotebookIcon, PlusIcon } from "lucide-react";

export function NotebookComboBox() {
  const {
    activeNotebook,
    setActiveNotebook,
    setFeedType,
    activeNote,
    setActiveNote,
    activeTag,
    setActiveTag,
  } = useAppState();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const queryClient = useQueryClient();

  const [notebookName, setNotebookName] = useState("");

  const handleNotebookNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNotebookName = e.target.value;
    setNotebookName(newNotebookName);
  };

  const handleSubmitNewNotebook = async () => {
    await NotebookService.CreateNotebook(notebookName);
    void queryClient.invalidateQueries({
      queryKey: ["notebooks"],
    });
    setNotebookName("");
  };

  async function fetchNotebooks() {
    const notebooks = await NotebookService.ListNotebooks();
    return notebooks;
  }

  const { data } = useQuery({
    queryKey: ["notebooks"],
    queryFn: () => fetchNotebooks(),
  });

  const selectNotebook = async (notebookName: string, notebook: Notebook) => {
    setActiveNotebook(notebook);
    setValue(notebookName);
    setOpen(false);
    setFeedType("notebook");
    if (activeNote?.NotebookID !== notebook.ID) {
      setActiveNote(undefined);
    }
    void queryClient.invalidateQueries({
      queryKey: ["notes"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["tags"],
    });
    if (activeTag) {
      const isTagAssociatedWithNotebook =
        await NotebookService.CheckTagForNotebook(notebook.ID, activeTag?.ID);
      if (isTagAssociatedWithNotebook) {
        setActiveTag(undefined);
      }
    }
  };

  return (
    <Dialog>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New Notebook</DialogTitle>
          <DialogDescription>
            Create a new notebook to organize your notes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input
              id="name"
              className="col-span-3"
              value={notebookName}
              onChange={handleNotebookNameChange}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="submit" onClick={handleSubmitNewNotebook}>
              Create
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <span
            role="combobox"
            aria-expanded={open}
            className="hover:bg-muted-hover flex w-full cursor-pointer items-center justify-between rounded-md text-sm font-medium text-muted-foreground transition-colors"
          >
            {activeNotebook === undefined ? (
              <span className="flex w-full cursor-pointer items-center justify-between rounded-md p-2 text-sm font-medium text-muted-foreground">
                <span className="flex">
                  <NotebookIcon className="mr-1.5 h-[1.2rem] w-[1.2rem]" />
                  Notebooks
                </span>
                <ChevronsUpDown className="h-4 w-4" />
              </span>
            ) : (
              <span className="flex w-full cursor-pointer items-center justify-between rounded-md bg-muted p-2 text-sm font-medium text-secondary-foreground">
                <span className="flex">
                  <NotebookIcon className="mr-1.5 h-[1.2rem] w-[1.2rem]" />
                  {activeNotebook.Name}
                </span>
                <ChevronsUpDown className="h-4 w-4" />
              </span>
            )}
          </span>
        </PopoverTrigger>
        <PopoverContent className="popover-content-width-full p-0">
          <Command>
            <CommandList>
              <CommandEmpty>No framework found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  className="cursor-pointer whitespace-nowrap pl-0"
                  value={"_New Notebook_"}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <DialogTrigger asChild>
                    <span className="flex w-full cursor-pointer items-center">
                      <PlusIcon className="h-4" />
                      New
                    </span>
                  </DialogTrigger>
                  {/* </NewNotebookDialog> */}
                </CommandItem>
                {data && data?.length > 0 && (
                  <div className="my-1 border-b border-primary/20"></div>
                )}
                {/* <CommandInput placeholder="Search..." /> */}
                {data?.map((notebook) => (
                  <CommandItem
                    className="flex w-full cursor-pointer justify-between whitespace-nowrap"
                    key={notebook.ID}
                    value={notebook.Name}
                    onSelect={(currentValue) =>
                      selectNotebook(currentValue, notebook)
                    }
                  >
                    {notebook.Name}
                    {activeNotebook?.ID === notebook.ID && (
                      <Check className="h-4 w-4" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Dialog>
  );
}
