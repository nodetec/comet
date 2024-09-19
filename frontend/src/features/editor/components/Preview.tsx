import { ScrollArea } from "~/components/ui/scroll-area";
import { processArticle } from "~/lib/markdown";
import { useAppState } from "~/store";

export const Preview = () => {
  const activeNote = useAppState((state) => state.activeNote);
  const activeTrashNote = useAppState((state) => state.activeTrashNote);

  const editorFullScreen = useAppState((state) => state.editorFullScreen);

  return (
    <ScrollArea className="flex h-full w-full">
      <article
        className={`break-anywhere prose prose-zinc mx-auto w-full dark:prose-invert ${editorFullScreen && "py-4"}`}
        dangerouslySetInnerHTML={{
          __html: processArticle(
            activeNote?.Content || activeTrashNote?.Content || "",
          ),
        }}
      />
    </ScrollArea>
  );
};

export default Preview;
