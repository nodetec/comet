import React, { useEffect, useState } from "react";

import { $isListNode, ListNode } from "@lexical/list";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isHeadingNode } from "@lexical/rich-text";
import { $getNearestNodeOfType, mergeRegister } from "@lexical/utils";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { cn } from "~/lib/utils";
import {
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { EllipsisVerticalIcon } from "lucide-react";

// import { PublishDialog } from "../../components/PublishDialog";
import CodeBlockPlugin from "../codeblock/CodeBlockPlugin";
import { MarkdownImagePlugin } from "../markdownImage/MarkdownImagePlugin";
import YoutubeAction from "../youtube/YouTubeActions";
import { LOW_PRIORIRTY, RICH_TEXT_OPTIONS, RichTextAction } from "./constants";
import { useKeyBinds } from "./hooks/useKeybinds";

export function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const [disableMap, setDisableMap] = useState<Record<string, boolean>>({
    [RichTextAction.Undo]: true,
    [RichTextAction.Redo]: true,
  });
  const [selectionMap, setSelectionMap] = useState<Record<string, boolean>>({});

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const blockTypeToName: Record<string, string> = {
    paragraph: "Paragraph",
    h1: "Heading 1",
    h2: "Heading 2",
    h3: "Heading 3",
    // Add more mappings if needed
  };

  type BlockType = keyof typeof blockTypeToName;

  const [blockType, setBlockType] = useState<BlockType>("paragraph");

  // Use useCallback to memoize the updateToolbar function
  const updateToolbar = React.useCallback(() => {
    const selection = $getSelection();

    if ($isRangeSelection(selection)) {
      const newSelectionMap = {
        [RichTextAction.Bold]: selection.hasFormat("bold"),
        [RichTextAction.Italics]: selection.hasFormat("italic"),
        // [RichTextAction.Underline]: selection.hasFormat("underline"),
        [RichTextAction.Strikethrough]: selection.hasFormat("strikethrough"),
        [RichTextAction.Code]: selection.hasFormat("code"),
      };
      setSelectionMap(newSelectionMap);

      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === "root"
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();
      const elementKey = element.getKey();
      const elementDOM = editor.getElementByKey(elementKey);

      if (!elementDOM) return;

      if ($isListNode(element)) {
        const parentList = $getNearestNodeOfType(anchorNode, ListNode);
        const type = parentList ? parentList.getTag() : element.getTag();
        setBlockType(type as BlockType);
      } else {
        const type = $isHeadingNode(element)
          ? element.getTag()
          : element.getType();
        setBlockType(type);
      }
    }
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar();
          return false;
        },
        LOW_PRIORIRTY,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setDisableMap((prevDisableMap) => ({
            ...prevDisableMap,
            undo: !payload,
          }));
          return false;
        },
        LOW_PRIORIRTY,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setDisableMap((prevDisableMap) => ({
            ...prevDisableMap,
            redo: !payload,
          }));
          return false;
        },
        LOW_PRIORIRTY,
      ),
    );
  }, [editor, updateToolbar]);

  const onAction = (id: RichTextAction) => {
    console.log("onAction", id);
    switch (id) {
      case RichTextAction.Bold: {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
        break;
      }
      case RichTextAction.Italics: {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
        break;
      }
      // case RichTextAction.Underline: {
      //   editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline");
      //   break;
      // }
      case RichTextAction.Strikethrough: {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough");
        break;
      }
      case RichTextAction.Code: {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code");
        break;
      }
      case RichTextAction.Undo: {
        editor.dispatchCommand(UNDO_COMMAND, undefined);
        break;
      }
      case RichTextAction.Redo: {
        editor.dispatchCommand(REDO_COMMAND, undefined);
        break;
      }
    }
  };

  useKeyBinds({ onAction });

  return (
    <div className="flex w-full items-center px-2">
      <div className="flex w-full items-center gap-2">
        <div className="flex items-center gap-2">
          {RICH_TEXT_OPTIONS.map(({ id, icon }, index) =>
            id === RichTextAction.Divider ? (
              <Separator
                orientation="vertical"
                className="h-4"
                key={`${id}-${index}`}
              />
            ) : (
              <Button
                key={`${id}-${index}`}
                className={cn(selectionMap[id] && "bg-primary/5")}
                size="icon"
                variant="ghost"
                onClick={() => onAction(id)}
                disabled={disableMap[id]}
              >
                {icon}
              </Button>
            ),
          )}
        </div>

        <div className="hidden items-center gap-2 xl:flex">
          <CodeBlockPlugin blockType={blockType} />
          <MarkdownImagePlugin />
          {/* <TwitterAction /> */}
          <YoutubeAction />
        </div>

        {/* <InsertProfileButton /> */}
      </div>
      <div className="flex items-center gap-2">
        {/* <PublishDialog /> */}
        <Button type="button" variant="ghost" size="icon">
          <EllipsisVerticalIcon />
        </Button>
      </div>
    </div>
  );
}
