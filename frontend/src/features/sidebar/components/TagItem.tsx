import { useQueryClient } from "@tanstack/react-query";
import { type Tag } from "&/comet/backend/db/schemas";
import { AppService } from "&/comet/backend/service";
import { useAppState } from "~/store";

type Props = {
  tag: Tag;
};

export function TagItem({ tag }: Props) {
  const queryClient = useQueryClient();
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    const half = Math.floor(maxLength / 2);
    return text.slice(0, half) + "..." + text.slice(-half);
  };

  const handleTagClick = async () => {
    if (feedType === "trash") {
      setFeedType("all");
    }
    if (tag.Active) {
      console.log("Tag is active");
      await AppService.SetTagActive(tag.ID, false);
    } else {
      await AppService.SetTagActive(tag.ID, true);
    }

    await queryClient.invalidateQueries({ queryKey: ["tags"] });
    await queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  return (
    <div
      key={tag.ID}
      style={
        {
          "--custom-contextmenu": "tagMenu",
          "--custom-contextmenu-data": `${tag.ID}`,
        } as React.CSSProperties
      }
      onClick={handleTagClick}
      className={`rouned-md flex cursor-pointer select-none items-center gap-2 truncate rounded-md bg-muted px-2 py-1 text-sm font-medium text-secondary-foreground ${tag.Active && "bg-sky-500/50 text-secondary-foreground"}`}
    >
      #{truncateText(tag.Name, 20)}
    </div>
  );
}
