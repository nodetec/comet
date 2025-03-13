import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useNotebooks } from "~/hooks/useNotebooks";
import { fromNow } from "~/lib/utils";
import { type Notebook } from "$/types/Notebook";
import { EyeClosedIcon, EyeIcon } from "lucide-react";

export function NotebookSettings() {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const notebooks = useNotebooks(true);

  const toggleNotebookVisibility = async (
    event: React.MouseEvent<HTMLButtonElement>,
    notebook: Notebook,
  ) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (notebook.hidden) {
        await window.api.unhideNotebook(notebook._id);
      } else {
        await window.api.hideNotebook(notebook._id);
      }
      await queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    } catch (error) {
      console.error("Error updating notebook visibility: ", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col space-y-4">
      <ScrollArea type="scroll">
        <h1 className="border-accent text-primary mx-12 border-b py-4 text-lg font-bold">
          Notebooks
        </h1>
        <div className="mx-12 my-4 h-full py-4">
          <div className="border-accent space-y-4 border-b pb-4">
            {notebooks.data?.map((notebook) => (
              <div
                className="flex items-center justify-between"
                key={notebook._id}
              >
                <div className="flex items-center justify-start gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={loading}
                    onClick={(event) =>
                      toggleNotebookVisibility(event, notebook)
                    }
                  >
                    {notebook.hidden ? <EyeClosedIcon /> : <EyeIcon />}
                  </Button>
                  <span>{notebook.name}</span>
                </div>
                <span className="text-accent-foreground text-sm">{`created ${fromNow(notebook.createdAt)}`}</span>
              </div>
            ))}
            {notebooks.data?.length === 0 && (
              <div className="text-accent-foreground text-sm">
                No notebooks found
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
