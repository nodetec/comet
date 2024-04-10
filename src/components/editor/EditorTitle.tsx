import { Input } from "~/components/ui/input";
import { useGlobalState } from "~/store";

export default function EditorTitle() {
  const { activeNote, setActiveNote } = useGlobalState();

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;

    if (activeNote === undefined) {
      return;
    }

    if (title === undefined) {
      return;
    }

    setActiveNote({
      ...activeNote,
      title,
    });
  };

  return (
    <Input
      type="text"
      className="border-none py-0 px-1 text-xl focus-visible:ring-0"
      placeholder="Untitled"
      value={activeNote?.title}
      onChange={handleTitleChange}
    />
  );
}
