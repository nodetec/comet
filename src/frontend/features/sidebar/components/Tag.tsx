import { useQueryClient } from "@tanstack/react-query";
import { cn } from "~/lib/utils";
import { useAppState } from "~/store";

type Props = {
  tag: string;
};

export function Tag({ tag }: Props) {
  const queryClient = useQueryClient();
  const activeTags = useAppState((state) => state.activeTags);
  const setActiveTags = useAppState((state) => state.setActiveTags);

  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);

  const handleTagClick = async () => {
    if (feedType === "trash") {
      setFeedType("all");
    }
    // add tag to active tags if it doesn't exist
    if (!activeTags.includes(tag)) {
      setActiveTags([...activeTags, tag]);
    } else {
      // remove tag from active tags if it exists
      setActiveTags(activeTags.filter((t) => t !== tag));
    }
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  return (
    <div
      key={tag}
      onClick={handleTagClick}
      className={cn(
        "rouned-md bg-accent text-secondary-foreground line-clamp-1 cursor-pointer truncate rounded-md px-2 py-1 text-sm font-medium break-all overflow-ellipsis whitespace-break-spaces select-none",
        activeTags.includes(tag) && "text-secondary-foreground bg-primary/50",
      )}
    >
      #{tag}
    </div>
  );
}
