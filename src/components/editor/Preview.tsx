import MarkdownPreview from "@uiw/react-markdown-preview";
import { useAppContext } from "~/store";
import rehypeSanitize from "rehype-sanitize";

const rehypePlugins = [rehypeSanitize];

export const Preview = () => {
  const { currentNote, currentTrashedNote } = useAppContext();

  return (
    <div className="editor-container h-full w-full overflow-y-auto">
      <div className="h-full w-full">
        <MarkdownPreview
          source={currentNote?.content ?? currentTrashedNote?.content ?? ""}
          className="pb-40 pl-[22px] pr-[18px] pt-4"
          rehypePlugins={rehypePlugins}
        />
      </div>
    </div>
  );
};

export default Preview;
