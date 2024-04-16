import { useGlobalState } from "~/store";
import { Trash2 } from "lucide-react";

export default function TrashedNotes() {
  const { activeTag, setActiveTag } = useGlobalState();

  const handleDisplayTrashedNotes = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    setActiveTag(undefined);
  };

  return (
    <div
      onClick={handleDisplayTrashedNotes}
      className={`flex cursor-pointer rounded-md p-2 mt-2 text-sm font-medium text-muted-foreground ${activeTag === undefined && "bg-muted"}`}
    >
      <Trash2 className="h-[1.2rem] w-[1.2rem]" />
      <span className="ml-1">Trash</span>
    </div>
  );
}
