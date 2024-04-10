import { Input } from "~/components/ui/input";
import { useGlobalState } from "~/store";

export default function EditorTitle() {

  const { activeNote, setActiveNote } = useGlobalState();

  return (
    <Input
      type="text"
      className=" border-none px-4 py-8 text-xl focus-visible:ring-0"
      placeholder="Untitled"
      value={activeNote?.title}
    />
  );
}
