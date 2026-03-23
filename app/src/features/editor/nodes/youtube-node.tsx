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
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 truncate text-left transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy URL"
      type="button"
    >
      {copied ? (
        <CheckIcon className="h-3 w-3 flex-none text-green-500" />
      ) : (
        <CopyIcon className="h-3 w-3 flex-none" />
      )}
      <span className="truncate">{url}</span>
    </button>
  );
}

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
        for (const node of deleteSelection.getNodes()) {
          if ($isYouTubeNode(node)) {
            node.remove();
          }
        }
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

  const url = `https://www.youtube.com/watch?v=${videoID}`;

  return (
    <span
      className="inline-block w-full px-1 py-2 align-bottom"
      style={
        isFocused ? { backgroundColor: "var(--editor-selection)" } : undefined
      }
    >
      <span ref={containerRef} className="block">
        {isEditable && (
          <span className="bg-muted/90 text-muted-foreground flex items-center gap-2 rounded-t-lg px-3 py-1.5 text-xs">
            <CopyUrlButton url={url} />
            <button
              className="text-muted-foreground hover:text-foreground flex-none transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                void openUrl(url);
              }}
              aria-label="Open in browser"
              title="Open in browser"
              type="button"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </button>
            <button
              className="text-muted-foreground hover:text-foreground flex-none transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                deleteNode();
              }}
              aria-label="Remove YouTube embed"
              title="Remove"
              type="button"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        )}

        <span
          className="block w-full overflow-hidden rounded-b-lg"
          style={{ aspectRatio: "16/9" }}
        >
          <iframe
            className="h-full w-full select-none"
            src={`https://www.youtube-nocookie.com/embed/${videoID}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube video"
            style={{ opacity: isFocused ? 0.7 : 1 }}
          />
        </span>
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
  const videoID = domNode.dataset.lexicalYoutube;
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
    element.dataset.lexicalYoutube = this.__id;
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
        if (!Object.hasOwn(domNode.dataset, "lexicalYoutube")) {
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
