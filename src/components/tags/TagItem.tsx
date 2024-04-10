import { useQueryClient } from "@tanstack/react-query";
import { useGlobalState } from "~/store";
import { type Tag } from "~/types";

type Props = {
  tag: Tag;
};

export default function TagItem({ tag }: Props) {
  const { activeTag, setActiveTag } = useGlobalState();
  const queryClient = useQueryClient();

  const handleSetActiveTag = async (
    e: React.MouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    e.preventDefault();
    setActiveTag(tag);
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  return (
    <div
      onClick={handleSetActiveTag}
      key={tag.id}
      className={`flex h-full w-full cursor-pointer select-none flex-col rounded-md px-4 py-2 text-sm font-medium ${tag.name === activeTag?.name && "bg-muted/80"}`}
    >
      <span
        className={`select-none text-muted-foreground ${tag.name === activeTag?.name && "text-secondary-foreground"}`}
      >
        {tag.name}
      </span>
    </div>
  );
}
