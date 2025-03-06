import {
  BoldIcon,
  Code,
  ItalicIcon,
  RedoIcon,
  StrikethroughIcon,
  UndoIcon,
} from "lucide-react";

export enum RichTextAction {
  Bold = "bold",
  Italics = "italics",
  // Underline = "underline",
  Strikethrough = "strikethrough",
  Code = "code",
  Divider = "divider",
  Undo = "undo",
  Redo = "redo",
}

export const RICH_TEXT_OPTIONS = [
  {
    id: RichTextAction.Bold,
    icon: <BoldIcon />,
    label: "Bold",
  },
  {
    id: RichTextAction.Italics,
    icon: <ItalicIcon />,
    label: "Italics",
  },
  // {
  //   id: RichTextAction.Underline,
  //   icon: <UnderlineIcon className="h-4 w-4" />,
  //   label: "Underline",
  // },
  {
    id: RichTextAction.Strikethrough,
    icon: <StrikethroughIcon />,
    label: "Strikethrough",
  },
  {
    id: RichTextAction.Code,
    icon: <Code />,
    label: "Code",
  },

  { id: RichTextAction.Divider },
  {
    id: RichTextAction.Undo,
    icon: <UndoIcon />,
    label: "Undo",
  },
  {
    id: RichTextAction.Redo,
    icon: <RedoIcon />,
    label: "Redo",
  },
  { id: RichTextAction.Divider },
];

export const LOW_PRIORIRTY = 1;
export const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
