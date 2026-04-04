import type { ReactNode } from "react";
import {
  Bold,
  Code,
  CodeXml,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Pilcrow,
  Strikethrough,
  Table,
} from "lucide-react";

import {
  type BlockType,
  type InlineFormat,
  type ToolbarState,
} from "@/features/editor/lib/toolbar-state";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

const BLOCK_ICONS: Record<BlockType, ReactNode> = {
  paragraph: <Pilcrow />,
  h1: <Heading1 />,
  h2: <Heading2 />,
  h3: <Heading3 />,
  code: <CodeXml />,
};

type EditorToolbarProps = {
  state: ToolbarState;
  onCycleBlockType(): void;
  onInsertCodeBlock(): void;
  onInsertImage(): void;
  onInsertTable(): void;
  onToggleInlineFormat(format: InlineFormat): void;
};

export function EditorToolbar({
  state,
  onCycleBlockType,
  onInsertCodeBlock,
  onInsertImage,
  onInsertTable,
  onToggleInlineFormat,
}: EditorToolbarProps) {
  return (
    <div
      className="bg-background/90 border-border flex items-center gap-1 rounded-2xl border p-1.5 shadow-lg backdrop-blur-xl"
      onMouseDown={(event) => event.preventDefault()}
    >
      <ToolbarButton
        active={state.blockType !== "paragraph"}
        onClick={onCycleBlockType}
        title="Cycle block style"
      >
        {BLOCK_ICONS[state.blockType]}
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton
        active={state.isBold}
        onClick={() => onToggleInlineFormat("bold")}
        title="Bold"
      >
        <Bold />
      </ToolbarButton>
      <ToolbarButton
        active={state.isItalic}
        onClick={() => onToggleInlineFormat("italic")}
        title="Italic"
      >
        <Italic />
      </ToolbarButton>
      <ToolbarButton
        active={state.isStrikethrough}
        onClick={() => onToggleInlineFormat("strikethrough")}
        title="Strikethrough"
      >
        <Strikethrough />
      </ToolbarButton>
      <ToolbarButton
        active={state.isCode}
        onClick={() => onToggleInlineFormat("code")}
        title="Inline code"
      >
        <Code />
      </ToolbarButton>

      <ToolbarSeparator />

      <ToolbarButton onClick={onInsertCodeBlock} title="Code block">
        <CodeXml />
      </ToolbarButton>
      <ToolbarButton onClick={onInsertImage} title="Insert image">
        <Image />
      </ToolbarButton>
      <ToolbarButton onClick={onInsertTable} title="Insert table">
        <Table />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  active = false,
  children,
  onClick,
  title,
}: {
  active?: boolean;
  children: ReactNode;
  onClick(): void;
  title: string;
}) {
  return (
    <Button
      className={cn(active && "bg-accent text-foreground shadow-sm")}
      onClick={onClick}
      size="icon-sm"
      title={title}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function ToolbarSeparator() {
  return <div className="bg-border mx-0.5 h-5 w-px" />;
}
