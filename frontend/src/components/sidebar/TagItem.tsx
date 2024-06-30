import { Tag } from "&/github.com/nodetec/captains-log/service";
import { useAppState } from "~/store";

type Props = {
  tag: Tag;
};

export default function TagItem({ tag }: Props) {
  const { activeTag, setActiveTag, feedType, setFeedType } = useAppState();

  const handleTagClick = () => {
    setFeedType("tag");
    setActiveTag(tag);
  };

  return (
    <span
      key={tag.ID}
      style={
        {
          "--custom-contextmenu": "tagMenu",
          "--custom-contextmenu-data": `${tag.ID}`,
        } as React.CSSProperties
      }
      onClick={handleTagClick}
      className={`flex h-full w-full cursor-pointer select-none flex-col rounded-md px-4 py-2 text-sm font-medium text-muted-foreground ${tag.Name === activeTag?.Name && feedType === "tag" && "bg-muted text-secondary-foreground"}`}
    >
      {tag.Name}
    </span>
  );
}
