import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createNodeSelection,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $setSelection,
  FORMAT_TEXT_COMMAND,
} from "lexical";
import {
  $isHeadingNode,
  $createHeadingNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $isCodeNode, $createCodeNode } from "@lexical/code";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { IMAGE_EXTENSIONS, importImage } from "@/lib/attachments";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Pilcrow,
  CodeXml,
  Image,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { $createImageNode } from "../nodes/image-node";

type BlockType = "paragraph" | "h1" | "h2" | "h3" | "code";

const BLOCK_CYCLE: BlockType[] = ["paragraph", "h1", "h2", "h3"];

const BLOCK_ICONS: Record<BlockType, React.ReactNode> = {
  paragraph: <Pilcrow className="size-4" />,
  h1: <Heading1 className="size-4" />,
  h2: <Heading2 className="size-4" />,
  h3: <Heading3 className="size-4" />,
  code: <CodeXml className="size-4" />,
};

interface ToolbarPluginProps {
  portalContainer: HTMLElement | null;
}

export default function ToolbarPlugin({ portalContainer }: ToolbarPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [blockType, setBlockType] = useState<BlockType>("paragraph");

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();

    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat("bold"));
      setIsItalic(selection.hasFormat("italic"));
      setIsStrikethrough(selection.hasFormat("strikethrough"));
      setIsCode(selection.hasFormat("code"));

      const anchorNode = selection.anchor.getNode();
      let element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : $findMatchingParent(anchorNode, (e) => {
              const parent = e.getParent();
              return parent !== null && $isRootOrShadowRoot(parent);
            });

      if (element === null) {
        element = anchorNode.getTopLevelElementOrThrow();
      }

      if ($isHeadingNode(element)) {
        setBlockType(element.getTag() as BlockType);
      } else if ($isCodeNode(element)) {
        setBlockType("code");
      } else {
        setBlockType("paragraph");
      }
    }
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar();
        });
      }),
    );
  }, [editor, updateToolbar]);

  const formatText = useCallback(
    (format: "bold" | "italic" | "strikethrough" | "code") => {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    },
    [editor],
  );

  const cycleBlockType = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const currentIndex = BLOCK_CYCLE.indexOf(blockType);
      const nextType = BLOCK_CYCLE[(currentIndex + 1) % BLOCK_CYCLE.length];

      if (nextType === "paragraph") {
        $setBlocksType(selection, () => $createParagraphNode());
      } else {
        $setBlocksType(selection, () =>
          $createHeadingNode(nextType as HeadingTagType),
        );
      }
    });
  }, [editor, blockType]);

  const insertCodeBlock = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createCodeNode());
      }
    });
  }, [editor]);

  const insertImage = useCallback(async () => {
    const sourcePath = await open({
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: IMAGE_EXTENSIONS,
        },
      ],
    });
    if (!sourcePath) return;
    const { assetUrl, altText } = await importImage(sourcePath);

    editor.update(() => {
      const imageNode = $createImageNode({ src: assetUrl, altText });
      const selection = $getSelection();
      if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes();
        const lastNode = nodes[nodes.length - 1];
        lastNode.getTopLevelElementOrThrow().insertAfter(imageNode);
      } else if (selection) {
        selection.insertNodes([imageNode]);
      } else {
        $getRoot().append(imageNode);
      }
      const nodeSelection = $createNodeSelection();
      nodeSelection.add(imageNode.getKey());
      $setSelection(nodeSelection);
    });
  }, [editor]);

  if (!portalContainer) return null;

  const toolbar = (
    <div
      className="bg-sidebar flex items-center gap-0.5 rounded-lg px-2 py-1.5 shadow-lg backdrop-blur-sm"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Block type cycle */}
      <ToolbarButton
        onClick={cycleBlockType}
        active={blockType !== "paragraph"}
        title="Cycle heading (P → H1 → H2 → H3)"
      >
        {BLOCK_ICONS[blockType]}
      </ToolbarButton>

      <Separator />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => formatText("bold")}
        active={isBold}
        title="Bold (⌘B)"
      >
        <Bold className="size-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => formatText("italic")}
        active={isItalic}
        title="Italic (⌘I)"
      >
        <Italic className="size-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => formatText("strikethrough")}
        active={isStrikethrough}
        title="Strikethrough"
      >
        <Strikethrough className="size-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => formatText("code")}
        active={isCode}
        title="Inline code"
      >
        <Code className="size-4" />
      </ToolbarButton>

      <Separator />

      {/* Insert actions */}
      <ToolbarButton onClick={insertCodeBlock} title="Code block">
        <CodeXml className="size-4" />
      </ToolbarButton>

      <ToolbarButton onClick={() => void insertImage()} title="Insert image">
        <Image className="size-4" />
      </ToolbarButton>
    </div>
  );

  return createPortal(toolbar, portalContainer);
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={active ? "bg-accent" : ""}
    >
      {children}
    </Button>
  );
}

function Separator() {
  return <div className="bg-border mx-1 h-5 w-px" />;
}
