type Tag = {
  id: string;
  name: string;
};

type Props = {
  tag: Tag;
};

export default function Tag({ tag }: Props) {
  const activeTag = { name: "blah" };

  return (
    <div
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
