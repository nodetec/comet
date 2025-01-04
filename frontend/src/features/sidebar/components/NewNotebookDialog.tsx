import { useState } from "react";

// import { type CheckedState } from "@radix-ui/react-checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";
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
import { PlusCircleIcon } from "lucide-react";
import { toast } from "sonner";

export function NewNotebookDialog() {
  const [name, setName] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const queryClient = useQueryClient();

  const handleCreate = async () => {
    console.log({ name });

    if (name.trim() === "") {
      return;
    }

    const trimmedName = name.trim();

    const notebookExists = await AppService.CheckNotebookExists(trimmedName);

    if (notebookExists) {
      toast.error("Notebook already exists");
      return;
    }

    await AppService.CreateNotebook(trimmedName);
    await queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    toast.success("Notebook created successfully");
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
