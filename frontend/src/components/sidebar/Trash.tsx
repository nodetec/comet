import { Trash2Icon } from "lucide-react";

export default function Trash() {
  const activeTag = undefined;
  let filter = "all";

  return (
    <div
      className={`flex cursor-pointer rounded-md p-2 text-sm font-medium text-muted-foreground ${filter === "trash" && activeTag === undefined && "bg-muted"}`}
    >
      <Trash2Icon className="h-[1.2rem] w-[1.2rem]" />
      <span className="ml-1">Trash</span>
    </div>
  );
}
