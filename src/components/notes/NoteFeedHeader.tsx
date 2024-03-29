import { PenBoxIcon } from "lucide-react";

import { Button } from "../ui/button";
import { useGlobalState } from "~/store";

export default function NoteFeedHeader() {

  const { setActiveNote } = useGlobalState();

  async function handleNewNote(
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) {
    e.preventDefault();
    setActiveNote(undefined)
  }

  return (
    <div className="flex justify-end">
      <Button onClick={handleNewNote} variant="outline" size="icon">
        <PenBoxIcon className="h-[1.2rem] w-[1.2rem]" />
      </Button>
    </div>
  );
}
