import { processArticle } from "~/lib/markdown";
import { useAppState } from "~/store";

export const Preview = () => {
  const activeNote = useAppState((state) => state.activeNote);
  const activeTrashNote = useAppState((state) => state.activeTrashNote);

  return (
    <div className="h-full w-full overflow-auto py-1">
      <article
        className="break-anywhere prose prose-zinc mx-auto w-full dark:prose-invert"
        dangerouslySetInnerHTML={{
          __html: processArticle(
            activeNote?.Content || activeTrashNote?.Content || "",
          ),
        }}
      />
    </div>
  );
};

export default Preview;
