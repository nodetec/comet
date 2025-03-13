import { useCallback, useEffect, useRef, useState, type JSX } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { mergeRegister } from "@lexical/utils";
import { cn } from "~/lib/utils";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
  type NodeKey,
} from "lexical";

import { $isMarkdownImageNode } from "../nodes/MarkdownImageNode";

function LazyImage({
  altText,
  className,
  imageRef,
  src,
  onError,
}: {
  altText: string;
  className: string | null;
  imageRef: { current: null | HTMLImageElement };
  src: string;
  onError: () => void;
}): JSX.Element {
  return (
    <div className="mr-1">
      <img
        className={className ?? ""}
        src={src}
        alt={altText}
        ref={imageRef}
        onError={onError}
        draggable="false"
      />
    </div>
  );
}

function BrokenImage(): JSX.Element {
  return (
    <img
      // TODO: Add broken image src
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      src={null}
      style={{
        height: 200,
        opacity: 0.2,
        width: 200,
      }}
      draggable="false"
    />
  );
}

export function MarkdownImageComponent({
  src,
  altText,
  nodeKey,
}: {
  altText: string;
  height: "inherit" | number;
  maxWidth: number;
  nodeKey: NodeKey;
  src: string;
  width: "inherit" | number;
}): JSX.Element {
  const imageRef = useRef<null | HTMLImageElement>(null);
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const [editor] = useLexicalComposerContext();
  const activeEditorRef = useRef<LexicalEditor | null>(null);
  const [isLoadError, setIsLoadError] = useState<boolean>(false);
  const isEditable = useLexicalEditable();

  const $onDelete = useCallback(
    (payload: KeyboardEvent) => {
      const deleteSelection = $getSelection();
      if (isSelected && $isNodeSelection(deleteSelection)) {
        const event: KeyboardEvent = payload;
        event.preventDefault();
        deleteSelection.getNodes().forEach((node) => {
          if ($isMarkdownImageNode(node)) {
            node.remove();
          }
        });
      }
      return false;
    },
    [isSelected],
  );

  const $onEnter = useCallback(
    (event: KeyboardEvent) => {
      const latestSelection = $getSelection();
      if (
        isSelected &&
        $isNodeSelection(latestSelection) &&
        latestSelection.getNodes().length === 1
      ) {
        event.preventDefault();

        // Get the image node
        const imageNode = $getNodeByKey(nodeKey);
        if (imageNode) {
          // Create a new paragraph
          const paragraphNode = $createParagraphNode();
          // Insert after the image
          imageNode.insertAfter(paragraphNode);
          // Set selection to the new paragraph
          paragraphNode.selectEnd();
        }

        // Clear the image selection
        clearSelection();
        return true;
      }
      return false;
    },
    [isSelected, nodeKey, clearSelection],
  );

  const onClick = useCallback(
    (payload: MouseEvent) => {
      const event = payload;

      if (event.target === imageRef.current) {
        if (event.shiftKey) {
          setSelected(!isSelected);
        } else {
          clearSelection();
          setSelected(true);
        }
        return true;
      }

      return false;
    },
    [isSelected, setSelected, clearSelection],
  );

  useEffect(() => {
    const unregister = mergeRegister(
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_, activeEditor) => {
          activeEditorRef.current = activeEditor;
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        onClick,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        $onEnter,
        COMMAND_PRIORITY_CRITICAL,
      ),
    );

    return () => {
      unregister();
    };
  }, [
    clearSelection,
    editor,
    isSelected,
    nodeKey,
    $onDelete,
    $onEnter,
    onClick,
    setSelected,
  ]);

  const isFocused = isSelected && isEditable;
  return (
    <>
      {isLoadError ? (
        <BrokenImage />
      ) : (
        <div className="max-w-xl">
          <LazyImage
            className={cn(
              "mt-2 h-auto w-auto cursor-default rounded-md object-contain",
              isFocused && "outline-2 outline-blue-500 select-none",
            )}
            src={src}
            altText={altText}
            imageRef={imageRef}
            onError={() => setIsLoadError(true)}
          />
        </div>
      )}
    </>
  );
}
