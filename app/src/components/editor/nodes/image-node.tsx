import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
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
  COMMAND_PRIORITY_CRITICAL,
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
import { listen } from "@tauri-apps/api/event";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { resolveImageSrc } from "@/lib/attachments";

type BlobFetchStatus = "downloaded" | "missing" | "needsUnlock";

export interface ImagePayload {
  src: string;
  altText?: string;
  width?: number;
  height?: number;
  key?: NodeKey;
}

export type SerializedImageNode = Spread<
  {
    src: string;
    altText: string;
    width?: number;
    height?: number;
  },
  SerializedLexicalNode
>;

function ImageComponent({
  src,
  altText,
  nodeKey,
}: {
  src: string;
  altText: string;
  width?: number;
  height?: number;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const imageRef = useRef<HTMLImageElement>(null);
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const [isLoadError, setIsLoadError] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const fetchAttempted = useRef(false);
  const isEditable = useLexicalEditable();

  const fetchImage = useCallback(async () => {
    const hashMatch = src.match(/([a-f0-9]{64})\.\w+/);
    if (!hashMatch) {
      console.warn("[image-node] missing attachment hash", { src, nodeKey });
      setIsLoadError(true);
      setNeedsUnlock(false);
      return;
    }

    console.debug("[image-node] fetch start", {
      src,
      nodeKey,
      hash: hashMatch[1],
    });
    setIsFetching(true);
    setIsLoadError(false);
    setNeedsUnlock(false);

    try {
      const result = await invoke<BlobFetchStatus>("fetch_blob", {
        hash: hashMatch[1],
      });
      console.debug("[image-node] fetch result", {
        src,
        nodeKey,
        hash: hashMatch[1],
        result,
      });
      switch (result) {
        case "downloaded": {
          setReloadToken(Date.now());
          fetchAttempted.current = true;
          break;
        }
        case "needsUnlock": {
          fetchAttempted.current = false;
          setNeedsUnlock(true);
          break;
        }
        case "missing":
        default: {
          fetchAttempted.current = true;
          setIsLoadError(true);
          break;
        }
      }
    } catch (error) {
      console.error("[image-node] fetch failed", {
        src,
        nodeKey,
        hash: hashMatch[1],
        error,
      });
      fetchAttempted.current = true;
      setIsLoadError(true);
    } finally {
      setIsFetching(false);
    }
  }, [nodeKey, src]);

  const onImageError = useCallback(() => {
    if (isFetching || needsUnlock) {
      console.debug("[image-node] img error ignored", {
        src,
        nodeKey,
        isFetching,
        needsUnlock,
      });
      return;
    }
    if (fetchAttempted.current) {
      console.warn("[image-node] img failed after fetch attempt", {
        src,
        nodeKey,
      });
      setIsLoadError(true);
      return;
    }
    console.debug("[image-node] img error triggering fetch", { src, nodeKey });
    fetchAttempted.current = true;
    void fetchImage();
  }, [fetchImage, isFetching, needsUnlock, nodeKey, src]);

  useEffect(() => {
    fetchAttempted.current = false;
    setIsLoadError(false);
    setIsFetching(false);
    setNeedsUnlock(false);
    setReloadToken(0);
  }, [src]);

  useEffect(() => {
    const unlisten = listen<{ state: string | { error: { message: string } } }>(
      "sync-status",
      (event) => {
        if (!needsUnlock || isFetching) {
          return;
        }
        const state = event.payload.state;
        if (typeof state !== "string" || state === "needsUnlock") {
          return;
        }
        console.debug("[image-node] retrying after unlock", {
          src,
          nodeKey,
          state,
        });
        fetchAttempted.current = false;
        void fetchImage();
      },
    );

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [fetchImage, isFetching, needsUnlock, nodeKey, src]);

  const $onDelete = useCallback(
    (event: KeyboardEvent) => {
      const deleteSelection = $getSelection();
      if (isSelected && $isNodeSelection(deleteSelection)) {
        event.preventDefault();
        for (const node of deleteSelection.getNodes()) {
          if ($isImageNode(node)) {
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
        const imageNode = $getNodeByKey(nodeKey);
        if (imageNode) {
          const paragraphNode = $createParagraphNode();
          imageNode.insertAfter(paragraphNode);
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
  }, [editor, onClick, $onDelete, $onEnter]);

  const isFocused = isSelected && isEditable;

  if (isFetching) {
    return (
      <span className="bg-muted text-muted-foreground inline rounded p-2 text-sm">
        Downloading image…
      </span>
    );
  }

  if (needsUnlock) {
    return (
      <span className="bg-muted text-muted-foreground inline rounded p-2 text-sm">
        Image not downloaded. Unlock sync to load.
      </span>
    );
  }

  if (isLoadError) {
    return (
      <span className="bg-muted text-muted-foreground inline rounded p-2 text-sm">
        Failed to load image
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center py-2 align-middle"
      style={
        isFocused ? { backgroundColor: "var(--editor-selection)" } : undefined
      }
    >
      <img
        key={reloadToken}
        ref={imageRef}
        src={reloadToken ? `${src}#t=${reloadToken}` : src}
        alt={altText}
        className="max-w-full cursor-default overflow-hidden select-none"
        style={{ opacity: isFocused ? 0.7 : 1 }}
        draggable="false"
        onLoad={() => {
          console.debug("[image-node] img loaded", {
            src,
            nodeKey,
            renderedSrc: reloadToken ? `${src}#t=${reloadToken}` : src,
          });
        }}
        onError={onImageError}
      />
    </span>
  );
}

export class ImageNode extends DecoratorNode<ReactNode> {
  __src: string;
  __altText: string;
  __width?: number;
  __height?: number;

  static getType(): string {
    return "image";
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(
      node.__src,
      node.__altText,
      node.__width,
      node.__height,
      node.__key,
    );
  }

  static importJSON(serializedNode: SerializedImageNode): ImageNode {
    const { src, altText, width, height } = serializedNode;
    return $createImageNode({ src, altText, width, height });
  }

  static importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: (domNode: HTMLElement) => {
          const img = domNode as HTMLImageElement;
          const rawSrc = img.getAttribute("src");
          if (!rawSrc) return null;
          const src = resolveImageSrc(rawSrc);
          const altText = img.getAttribute("alt") || "";
          return {
            node: $createImageNode({ src, altText }),
          };
        },
        priority: 0,
      }),
    };
  }

  constructor(
    src: string,
    altText?: string,
    width?: number,
    height?: number,
    key?: NodeKey,
  ) {
    super(key);
    this.__src = src;
    this.__altText = altText || "";
    this.__width = width;
    this.__height = height;
  }

  exportJSON(): SerializedImageNode {
    return {
      type: "image",
      version: 1,
      src: this.__src,
      altText: this.__altText,
      width: this.__width,
      height: this.__height,
    };
  }

  exportDOM(): DOMExportOutput {
    const img = document.createElement("img");
    img.setAttribute("src", this.__src);
    img.setAttribute("alt", this.__altText);
    if (this.__width) {
      img.setAttribute("width", String(this.__width));
    }
    if (this.__height) {
      img.setAttribute("height", String(this.__height));
    }
    return { element: img };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    const theme = config.theme;
    const className = theme.image;
    if (className) {
      span.className = className;
    }
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getSrc(): string {
    return this.__src;
  }

  getAltText(): string {
    return this.__altText;
  }

  decorate(): ReactNode {
    return (
      <ImageComponent
        src={this.__src}
        altText={this.__altText}
        width={this.__width}
        height={this.__height}
        nodeKey={this.__key}
      />
    );
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }
}

export function $createImageNode({
  src,
  altText = "",
  width,
  height,
  key,
}: ImagePayload): ImageNode {
  return $applyNodeReplacement(new ImageNode(src, altText, width, height, key));
}

export function $isImageNode(
  node: LexicalNode | null | undefined,
): node is ImageNode {
  return node instanceof ImageNode;
}
