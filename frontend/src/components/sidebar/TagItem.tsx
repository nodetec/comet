import { NoteTagService, Tag } from "&/github.com/nodetec/captains-log/service";
import { useAppState } from "~/store";
import { CircleIcon } from "lucide-react";

type Props = {
  tag: Tag;
};

export default function TagItem({ tag }: Props) {
  const activeNote = useAppState((state) => state.activeNote);
  const setActiveNote = useAppState((state) => state.setActiveNote);
  const activeTag = useAppState((state) => state.activeTag);
  const setActiveTag = useAppState((state) => state.setActiveTag);
  const feedType = useAppState((state) => state.feedType);
  const setFeedType = useAppState((state) => state.setFeedType);

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
    <div
      key={tag.ID}
      style={
        {
          "--custom-contextmenu": "tagMenu",
          "--custom-contextmenu-data": `${tag.ID}`,
        } as React.CSSProperties
      }
      onClick={handleTagClick}
      className={`flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1 pl-6 text-sm font-medium text-muted-foreground ${tag.Name === activeTag?.Name && "bg-muted text-secondary-foreground"}`}
    >
      <CircleIcon className="h-[0.7rem] w-[0.7rem] fill-accent text-accent" />
      <span className={`w-full truncate`}>{tag.Name}</span>
    </div>
  );
}
