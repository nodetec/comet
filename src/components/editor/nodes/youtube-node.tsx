import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { mergeRegister } from "@lexical/utils";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { XIcon } from "lucide-react";

type YouTubeComponentProps = Readonly<{
  nodeKey: NodeKey;
  videoID: string;
}>;

function YouTubeComponent({ nodeKey, videoID }: YouTubeComponentProps) {
  const [editor] = useLexicalComposerContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const isEditable = useLexicalEditable();

  const deleteNode = useCallback(() => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) {
        node.remove();
      }
    });
  }, [editor, nodeKey]);

  const $onDelete = useCallback(
    (event: KeyboardEvent) => {
      const deleteSelection = $getSelection();
      if (isSelected && $isNodeSelection(deleteSelection)) {
        event.preventDefault();
        deleteSelection.getNodes().forEach((node) => {
          if ($isYouTubeNode(node)) {
            node.remove();
          }
        });
        return true;
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
        const youtubeNode = $getNodeByKey(nodeKey);
        if (youtubeNode) {
          const paragraphNode = $createParagraphNode();
          youtubeNode.insertAfter(paragraphNode);
          paragraphNode.selectEnd();
        }
        clearSelection();
        return true;
      }
      return false;
    },
    [isSelected, nodeKey, clearSelection],
  );

  const onClick = useCallback(
    (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
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
    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        onClick,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(KEY_ENTER_COMMAND, $onEnter, COMMAND_PRIORITY_LOW),
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
    );
  }, [editor, onClick, $onEnter, $onDelete]);

  const isFocused = isSelected && isEditable;

  return (
    <span className="my-2 inline-block w-full align-bottom">
      <span
        ref={containerRef}
        className={`relative block rounded-lg border-2 p-1 transition-colors ${
          isFocused
            ? "border-primary"
            : "border-border hover:border-muted-foreground/30"
        }`}
      >
        <span
          className="relative block w-full overflow-hidden rounded"
          style={{ paddingBottom: "56.25%" }}
        >
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${videoID}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube video"
          />
        </span>

        {isEditable && (
          <button
            className="bg-muted-foreground text-background hover:bg-foreground absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full shadow-md transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              deleteNode();
            }}
            aria-label="Remove YouTube embed"
            type="button"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </span>
    </span>
  );
}

export type SerializedYouTubeNode = Spread<
  { videoID: string },
  SerializedLexicalNode
>;

function $convertYoutubeElement(
  domNode: HTMLElement,
): null | DOMConversionOutput {
  const videoID = domNode.getAttribute("data-lexical-youtube");
  if (videoID) {
    const node = $createYouTubeNode(videoID);
    return { node };
  }
  return null;
}

export class YouTubeNode extends DecoratorNode<ReactNode> {
  __id: string;

  static getType(): string {
    return "youtube";
  }

  static clone(node: YouTubeNode): YouTubeNode {
    return new YouTubeNode(node.__id, node.__key);
  }

  static importJSON(serializedNode: SerializedYouTubeNode): YouTubeNode {
    return $createYouTubeNode(serializedNode.videoID);
  }

  exportJSON(): SerializedYouTubeNode {
    return {
      type: "youtube",
      version: 1,
      videoID: this.__id,
    };
  }

  constructor(id: string, key?: NodeKey) {
    super(key);
    this.__id = id;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("iframe");
    element.setAttribute("data-lexical-youtube", this.__id);
    element.setAttribute("width", "560");
    element.setAttribute("height", "315");
    element.setAttribute(
      "src",
      `https://www.youtube-nocookie.com/embed/${this.__id}`,
    );
    element.setAttribute("frameborder", "0");
    element.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
    );
    element.setAttribute("allowfullscreen", "true");
    element.setAttribute("title", "YouTube video");
    return { element };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      iframe: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-youtube")) {
          return null;
        }
        return {
          conversion: $convertYoutubeElement,
          priority: 1,
        };
      },
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    const theme = config.theme;
    const className = theme.youtube;
    if (className) {
      span.className = className;
    }
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getId(): string {
    return this.__id;
  }

  getTextContent(): string {
    return `https://www.youtube.com/watch?v=${this.__id}`;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): ReactNode {
    return <YouTubeComponent nodeKey={this.getKey()} videoID={this.__id} />;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }
}

export function $createYouTubeNode(videoID: string): YouTubeNode {
  return $applyNodeReplacement(new YouTubeNode(videoID));
}

export function $isYouTubeNode(
  node: YouTubeNode | LexicalNode | null | undefined,
): node is YouTubeNode {
  return node instanceof YouTubeNode;
}
