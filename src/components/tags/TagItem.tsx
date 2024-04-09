import { useQueryClient } from "@tanstack/react-query";
import { useGlobalState } from "~/store";
import { type Tag } from "~/types";

type Props = {
  tag: Tag;
};

export default function TagItem({ tag }: Props) {
  const { setActiveTag } = useGlobalState();
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
      className="flex h-full w-full cursor-pointer select-none flex-col gap-y-1 rounded-md p-2 text-sm hover:bg-muted/80"
    >
      <span className="select-none text-muted-foreground">{tag.name}</span>
    </div>
  );
}
