import { Tag } from "&/github.com/nodetec/captains-log/service";
import { useAppState } from "~/store";

type Props = {
  tag: Tag;
};

export default function TagItem({ tag }: Props) {
  const { activeTag, setActiveTag } = useAppState();

  const handleTagClick = () => {
    setActiveTag(tag);
  }

  return (
    <div
      key={tag.ID}
      onClick={handleTagClick}
      className={`flex h-full w-full cursor-pointer select-none flex-col rounded-md px-4 py-2 text-sm font-medium ${tag.Name === activeTag?.Name && "bg-muted/80"}`}
    >
      <span
        className={`select-none text-muted-foreground ${tag.Name === activeTag?.Name && "text-secondary-foreground"}`}
      >
        {tag.Name}
      </span>
    </div>
  );
}
