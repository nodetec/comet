import { $createCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $setBlocksType } from "@lexical/selection";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useAppState } from "~/store";
import { $getSelection, $isRangeSelection } from "lexical";
import { SquareCodeIcon } from "lucide-react";

interface CodeBlockPluginProps {
  blockType: string;
}

export default function CodeBlockPlugin({ blockType }: CodeBlockPluginProps) {
  const [editor] = useLexicalComposerContext();
  const feedType = useAppState((state) => state.feedType);

  //   useEffect(() => {
  //     registerCodeHighlighting(editor);
  //   }, [editor]);

  const onAddCodeBlock = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        // Create the code block
        const codeNode = $createCodeNode();

        // First transform selection to codeblock
        $setBlocksType(selection, () => codeNode);
      }
    });
  };

  return (
    <Button
      size="icon"
      variant="ghost"
      className={cn(
        "hidden lg:flex",
        blockType === "code" ? "bg-accent/50" : "",
      )}
      onClick={onAddCodeBlock}
      onDoubleClick={(e) => e.stopPropagation()}
      disabled={feedType === "trash"}
    >
      <SquareCodeIcon />
    </Button>
  );
}
