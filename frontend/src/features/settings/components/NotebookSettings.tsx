import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { type Notebook } from "&/comet/backend/models/models";
import { AppService } from "&/comet/backend/service";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useNotebooks } from "~/hooks/useNotebooks";
import { fromNow } from "~/lib/utils";
import { EyeClosedIcon, EyeIcon } from "lucide-react";

export function NotebookSettings() {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const notebooks = useNotebooks(false);

  const toggleNotebookVisibility = async (
    event: React.MouseEvent<HTMLButtonElement>,
    notebook: Notebook,
  ) => {
    event.preventDefault();
    setLoading(true);
    try {
      if (notebook.PinnedAt) {
        await AppService.HideNotebook(notebook.ID);
      } else {
        await AppService.ShowNotebook(notebook.ID);
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
        <h1 className="mx-12 border-b border-muted py-4 text-lg font-bold text-primary">
          Notebooks
        </h1>
        <div className="mx-12 my-4 h-full py-4">
          <div className="space-y-4 border-b border-muted pb-4">
            {notebooks.data?.map((notebook) => (
              <div
                className="flex items-center justify-between"
                key={notebook.ID}
              >
                <div className="flex items-center justify-start gap-3">
                  <Button
                    variant="muted"
                    size="icon-sm"
                    disabled={loading}
                    onClick={(event) =>
                      toggleNotebookVisibility(event, notebook)
                    }
                  >
                    {notebook.PinnedAt ? <EyeIcon /> : <EyeClosedIcon />}
                  </Button>
                  <span>{notebook.Name}</span>
                </div>
                <span className="text-sm text-muted-foreground">{`created ${fromNow(notebook.CreatedAt)}`}</span>
              </div>
            ))}
            {notebooks.data?.length === 0 && (
              <div className="text-sm text-muted-foreground">
                No notebooks found
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
