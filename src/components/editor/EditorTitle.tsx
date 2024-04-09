import { Input } from "~/components/ui/input";

export default function EditorTitle() {
  return (
    <Input
      type="text"
      className=" border-none px-4 py-8 text-xl focus-visible:ring-0"
      placeholder="Untitled"
    />
  );
}
