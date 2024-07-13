import { NoteTagService, Tag } from "&/github.com/nodetec/captains-log/service";
import { useAppState } from "~/store";
import { CircleIcon } from "lucide-react";

type Props = {
  tag: Tag;
};

export default function TagItem({ tag }: Props) {
  const {
    activeTag,
    setActiveTag,
    activeNote,
    setActiveNote,
    feedType,
    setFeedType,
  } = useAppState();

  const handleTagClick = async () => {
    if (feedType === "trash") {
      setFeedType("all");
    }

    if (activeTag?.Name === tag.Name) {
      setActiveTag(undefined);
      return;
    }

    setActiveTag(tag);
    // TODO: check if active note is has the tag
    // if it does not, set active note to undefined

    if (!activeNote) return;
    const isTagAssociated = await NoteTagService.CheckTagForNote(
      activeNote.ID,
      tag.ID,
    );

    if (!isTagAssociated) {
      setActiveNote(undefined);
    }
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
      className={`flex h-full w-full cursor-pointer select-none items-center gap-2 rounded-md py-2 pl-6 text-sm font-medium text-muted-foreground ${tag.Name === activeTag?.Name && "bg-muted text-secondary-foreground"}`}
    >
      <CircleIcon className="h-[0.7rem] w-[0.7rem] fill-accent text-accent" />
      {tag.Name}
    </span>
  );
}
