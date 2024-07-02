import MarkdownPreview from "@uiw/react-markdown-preview";
import { useAppState } from "~/store";
import rehypeSanitize from "rehype-sanitize";

const rehypePlugins = [rehypeSanitize];

export const Preview = () => {
  const { activeNote, activeTrashNote } = useAppState();

  return (
    <div className="h-full w-full overflow-auto py-1 pl-4">
      <MarkdownPreview
        source={activeNote?.Content || activeTrashNote?.Content || ""}
        className="pl-1.5 pr-0.5"
        rehypePlugins={rehypePlugins}
      />
    </div>
  );
};

export default Preview;
