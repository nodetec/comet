import { useState } from "react";

// import { type CheckedState } from "@radix-ui/react-checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
// import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";
import { PlusCircleIcon } from "lucide-react";
import { toast } from "sonner";

export function NewNotebookBtn() {
  const [name, setName] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const queryClient = useQueryClient();

  const setNoteSearch = useAppState((state) => state.setNoteSearch);

  const handleCreate = async () => {
    console.log({ name });

    if (name.trim() === "") {
      return;
    }

    const trimmedName = name.trim();

    try {
      await window.api.createNotebook(trimmedName);
      await queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      setIsOpen(false);
      setName("");
      setNoteSearch("");
    } catch (error) {
      console.error(error);
      toast.error("Notebook already exists");
    }
    setIsOpen(false);
    setName(""); // Clear the input field
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          className="flex justify-start gap-2 text-sm hover:bg-transparent [&_svg]:size-[1rem]"
          variant="ghost"
        >
          <PlusCircleIcon />
          Notebook
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Notebook</DialogTitle>
          <DialogDescription>
            Create a new notebook to organize your notes
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            className="focus-visible:ring-blue-400/80"
            placeholder="Notebook Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleCreate();
              }
            }}
            autoFocus
          />
          {/* <div className="flex items-center space-x-2">
            <Checkbox
              checked={pinned}
              onCheckedChange={(checked) => setPinned(checked)}
            />
            <label>Pin this notebook</label>
          </div> */}
        </div>
        <DialogFooter>
          <Button onClick={handleCreate}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
