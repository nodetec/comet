import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

export const StatsDialog = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="mx-auto my-auto flex max-h-[70%] min-h-[70%] min-w-[50%] max-w-[50%] flex-col items-start justify-start border border-accent p-4">
        <DialogHeader className="w-full">
          <DialogTitle className="text-primary">Stats</DialogTitle>
        </DialogHeader>
        <div className="min-h-full w-full overflow-y-auto">
          <ul className="w-full space-y-2">
            <li>Stat 1</li>
            <li>Stat 2</li>
            <li>Stat 3</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
};

