import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { $isListItemNode, $isListNode } from "@lexical/list";
import {
  PASTE_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $getRoot,
  $getNodeByKey,
  $isElementNode,
  $setSelection,
  type LexicalNode,
  type PointType,
} from "lexical";
import { $findMatchingParent } from "@lexical/utils";
import { $generateNodesFromDOM } from "@lexical/html";
import { renderMarkdownToHtml } from "@/shared/api/invoke";
import { importImageBytes } from "@/shared/lib/attachments";
import {
  parseSingleChecklistItemContent,
  replaceEmptyChecklistItemWithChecklistNodes,
} from "../lib/checklist-paste";
import { $insertImportedImages } from "../lib/image-insert";
import {
  isBlockLevelNode,
  isReplaceableEmptyBlockNode,
  parseSingleFencedCodeBlock,
  trimBoundaryEmptyParagraphs,
} from "../lib/markdown-paste";
import {
  normalizeImportedCodeBlocksFromMarkdown,
  normalizeImportedNodes,
} from "../lib/markdown";

/* eslint-disable sonarjs/slow-regex -- patterns are tested against bounded clipboard content */
// Patterns that strongly indicate markdown content
const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+\S/m, // Headings: # Heading
  /\*\*[^*]+\*\*/, // Bold: **text**
  /(?<!\*)\*[^*]+\*(?!\*)/, // Italic: *text* (not preceded/followed by *)
  /~~[^~]+~~/, // Strikethrough: ~~text~~
  /`[^`]+`/, // Inline code: `code`
  /^```/m, // Code block start
  /^\s*[-*+]\s+\S/m, // Unordered list: - item or * item
  /^\s*\d+\.\s+\S/m, // Ordered list: 1. item
  /\[([^\]]+)\]\(([^)]+)\)/, // Links: [text](url)
  /!\[([^\]]*)\]\(([^)]+)\)/, // Images: ![alt](url)
  /^\s*>\s+\S/m, // Blockquote: > text
  /^\s*---\s*$/m, // Horizontal rule
  /^\s*\*\*\*\s*$/m, // Horizontal rule (asterisks)
  /\|.+\|.+\|/, // Table row: | cell | cell |
];
/* eslint-enable sonarjs/slow-regex */

// Patterns that indicate it's probably NOT markdown (just plain text)
const PLAIN_TEXT_INDICATORS = [
  /^https?:\/\/[^\s]+$/, // Single URL
];
const SUPPORTED_CLIPBOARD_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

function isSelectionInsideChecklistItem(
  selection: ReturnType<typeof $getSelection>,
): boolean {
  if (!$isRangeSelection(selection)) {
    return false;
  }

  const listItemNode = $findMatchingParent(
    selection.anchor.getNode(),
    $isListItemNode,
  );
  if (!listItemNode) {
    return false;
  }

  const parentList = listItemNode.getParent();
  return $isListNode(parentList) && parentList.getListType() === "check";
}

type SelectionPointSnapshot = {
  key: PointType["key"];
  offset: number;
  type: PointType["type"];
};

type RangeSelectionSnapshot = {
  anchor: SelectionPointSnapshot;
  focus: SelectionPointSnapshot;
};

function captureSelectionSnapshot(
  selection: ReturnType<typeof $getSelection>,
): RangeSelectionSnapshot | null {
  if (!$isRangeSelection(selection)) {
    return null;
  }

  return {
    anchor: {
      key: selection.anchor.key,
      offset: selection.anchor.offset,
      type: selection.anchor.type,
    },
    focus: {
      key: selection.focus.key,
      offset: selection.focus.offset,
      type: selection.focus.type,
    },
  };
}

function restoreSelectionSnapshot(
  snapshot: RangeSelectionSnapshot | null,
): boolean {
  if (snapshot === null) {
    return false;
  }

  if (
    $getNodeByKey(snapshot.anchor.key) === null ||
    $getNodeByKey(snapshot.focus.key) === null
  ) {
    return false;
  }

  const selection = $createRangeSelection();
  selection.anchor.set(
    snapshot.anchor.key,
    snapshot.anchor.offset,
    snapshot.anchor.type,
  );
  selection.focus.set(
    snapshot.focus.key,
    snapshot.focus.offset,
    snapshot.focus.type,
  );
  $setSelection(selection);
  return true;
}

function appendNodesToRoot(nodes: LexicalNode[]): void {
  const root = $getRoot();
  for (const node of nodes) {
    root.append(node);
  }
}

function insertNodesAfterReference(
  referenceNode: LexicalNode,
  nodes: LexicalNode[],
): void {
  for (let index = 0; index < nodes.length; index++) {
    const after = index === 0 ? referenceNode : nodes[index - 1];
    after.insertAfter(nodes[index]);
  }
}

function selectEndOfLastElement(nodes: LexicalNode[]): void {
  const [lastNode] = nodes.slice(-1);
  if ($isElementNode(lastNode)) {
    lastNode.selectEnd();
  }
}

function insertNodesAtRangeSelection(
  selection: ReturnType<typeof $getSelection>,
  nodes: LexicalNode[],
): void {
  if (!$isRangeSelection(selection)) {
    appendNodesToRoot(nodes);
    return;
  }

  if (!selection.isCollapsed()) {
    selection.removeText();
  }

  const anchorNode = selection.anchor.getNode();
  const selectedChecklistItem = $findMatchingParent(
    anchorNode,
    $isListItemNode,
  );
  if (
    selectedChecklistItem &&
    replaceEmptyChecklistItemWithChecklistNodes(selectedChecklistItem, nodes)
  ) {
    return;
  }

  const targetBlock = anchorNode.getTopLevelElementOrThrow();
  if (isReplaceableEmptyBlockNode(targetBlock)) {
    targetBlock.replace(nodes[0]);
    insertNodesAfterReference(nodes[0], nodes.slice(1));
  } else {
    insertNodesAfterReference(targetBlock, nodes);
  }

  selectEndOfLastElement(nodes);
}

function insertBlockNodes(nodes: LexicalNode[]): void {
  if (nodes.length === 0) return;

  insertNodesAtRangeSelection($getSelection(), nodes);
}

function isSupportedClipboardImageFile(file: File): boolean {
  return SUPPORTED_CLIPBOARD_IMAGE_TYPES.has(file.type.toLowerCase());
}

function listClipboardImageFiles(clipboardData: DataTransfer): File[] {
  const imageItems = [...clipboardData.items]
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
    .filter(isSupportedClipboardImageFile);

  if (imageItems.length > 0) {
    return imageItems;
  }

  return [...clipboardData.files].filter(isSupportedClipboardImageFile);
}

async function importClipboardImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = file.name.trim();
  const altText = fileName ? fileName.replace(/\.[^.]+$/, "") : "";
  return importImageBytes(bytes, altText);
}

async function processClipboardImagePaste(params: {
  currentLoadKeyRef: LoadKeyRef;
  editor: ReturnType<typeof useLexicalComposerContext>[0];
  files: File[];
  pasteLoadKey: string;
  selectionSnapshot: RangeSelectionSnapshot | null;
}): Promise<void> {
  const { currentLoadKeyRef, editor, files, pasteLoadKey, selectionSnapshot } =
    params;

  const results = await Promise.all(
    files.map((file) =>
      importClipboardImage(file).catch((error) => {
        console.error("[editor:paste] image import failed", error);
        return null;
      }),
    ),
  );

  if (currentLoadKeyRef.current !== pasteLoadKey) {
    return;
  }

  editor.update(() => {
    if (currentLoadKeyRef.current !== pasteLoadKey) {
      return;
    }

    restoreSelectionSnapshot(selectionSnapshot);
    $insertImportedImages(results);
  });
}

// Check if content looks like JSON or JSONC (JSON with comments)
function isLikelyJSON(text: string): boolean {
  const trimmed = text.trim();
  // Check if it starts with [ or { and ends with ] or }
  if (
    (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
    (trimmed.startsWith("{") && trimmed.endsWith("}"))
  ) {
    // Try to parse as-is first
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      // Try stripping comments (JSONC support)
      const withoutComments = trimmed
        .replace(/\/\/.*$/gm, "") // eslint-disable-line sonarjs/slow-regex -- bounded clipboard content
        .replace(/\/\*[\s\S]*?\*\//g, "");
      try {
        JSON.parse(withoutComments);
        return true;
      } catch {
        // Still not valid JSON, but if it has JSON-like structure, skip markdown
        // Check for typical JSON patterns: "key": value
        return /"[^"]+"\s*:\s*/.test(trimmed);
      }
    }
  }
  return false;
}

function isLikelyMarkdown(text: string): boolean {
  // If it's a single-line that matches plain text indicators, skip
  const trimmed = text.trim();
  if (!trimmed.includes("\n")) {
    for (const pattern of PLAIN_TEXT_INDICATORS) {
      if (pattern.test(trimmed)) {
        return false;
      }
    }
  }

  // Check if any markdown patterns match
  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

function insertFallbackPlainText(
  text: string,
  selectionSnapshot: RangeSelectionSnapshot | null,
): void {
  restoreSelectionSnapshot(selectionSnapshot);
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    selection.insertRawText(text);
    return;
  }

  const paragraph = $createParagraphNode();
  if (text.length > 0) {
    paragraph.append($createTextNode(text));
  }
  $getRoot().append(paragraph);
}

function htmlToDOM(html: string): Document {
  return new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );
}

type LoadKeyRef = { current: string };

function insertRenderedMarkdown(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  html: string,
  text: string,
  selectionSnapshot: RangeSelectionSnapshot | null,
  pasteLoadKey: string,
  currentLoadKeyRef: LoadKeyRef,
): void {
  editor.update(() => {
    if (currentLoadKeyRef.current !== pasteLoadKey) {
      return;
    }

    restoreSelectionSnapshot(selectionSnapshot);

    const dom = htmlToDOM(html);
    const allNodes = normalizeImportedNodes($generateNodesFromDOM(editor, dom));
    normalizeImportedCodeBlocksFromMarkdown(allNodes, text);
    // Filter to block-level nodes only — $generateNodesFromDOM may
    // produce stray TextNodes from whitespace between HTML tags
    const filteredNodes = allNodes.filter(isBlockLevelNode);
    const nodes = trimBoundaryEmptyParagraphs(filteredNodes, text);
    insertBlockNodes(nodes);
  });
}

function insertFallbackMarkdownText(
  editor: ReturnType<typeof useLexicalComposerContext>[0],
  text: string,
  selectionSnapshot: RangeSelectionSnapshot | null,
  pasteLoadKey: string,
  currentLoadKeyRef: LoadKeyRef,
): void {
  if (currentLoadKeyRef.current !== pasteLoadKey) {
    return;
  }

  editor.update(() => {
    insertFallbackPlainText(text, selectionSnapshot);
  });
}

async function processMarkdownPasteRender(params: {
  currentLoadKeyRef: LoadKeyRef;
  editor: ReturnType<typeof useLexicalComposerContext>[0];
  pasteLoadKey: string;
  selectionSnapshot: RangeSelectionSnapshot | null;
  text: string;
}): Promise<void> {
  const { currentLoadKeyRef, editor, pasteLoadKey, selectionSnapshot, text } =
    params;

  let html: string;
  try {
    html = await renderMarkdownToHtml(text);
  } catch (error) {
    console.error("[editor:paste] markdown render failed", error);
    insertFallbackMarkdownText(
      editor,
      text,
      selectionSnapshot,
      pasteLoadKey,
      currentLoadKeyRef,
    );
    return;
  }

  if (currentLoadKeyRef.current !== pasteLoadKey) {
    return;
  }

  insertRenderedMarkdown(
    editor,
    html,
    text,
    selectionSnapshot,
    pasteLoadKey,
    currentLoadKeyRef,
  );
}

interface MarkdownPastePluginProps {
  loadKey: string;
}

export default function MarkdownPastePlugin({
  loadKey,
}: MarkdownPastePluginProps) {
  const [editor] = useLexicalComposerContext();
  const currentLoadKeyRef = useRef(loadKey);
  const pasteQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    currentLoadKeyRef.current = loadKey;
  }, [loadKey]);

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent | InputEvent | KeyboardEvent) => {
        if (!(event instanceof ClipboardEvent)) {
          return false;
        }

        const clipboardData = event.clipboardData;
        if (!clipboardData) {
          return false;
        }

        const imageFiles = listClipboardImageFiles(clipboardData);
        if (imageFiles.length > 0) {
          const selection = $getSelection();
          const selectionSnapshot = captureSelectionSnapshot(selection);
          const pasteLoadKey = currentLoadKeyRef.current;
          event.preventDefault();
          void processClipboardImagePaste({
            currentLoadKeyRef: currentLoadKeyRef as LoadKeyRef,
            editor,
            files: imageFiles,
            pasteLoadKey,
            selectionSnapshot,
          });
          return true;
        }

        const text = clipboardData.getData("text/plain");
        const lexicalJson = clipboardData.getData(
          "application/x-lexical-editor",
        );

        if (!text) {
          return false;
        }

        const markdownCandidate = !isLikelyJSON(text) && isLikelyMarkdown(text);

        // Prefer markdown-looking plain text even if Lexical JSON is present.
        // This matters when copying source markdown from another Lexical-based
        // app/editor that also adds application/x-lexical-editor.
        if (lexicalJson && !markdownCandidate) {
          return false;
        }

        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const parentCodeNode = $findMatchingParent(
            selection.anchor.getNode(),
            $isCodeNode,
          );
          if (parentCodeNode) {
            return false;
          }
        }

        // Skip if it looks like JSON
        if (isLikelyJSON(text)) {
          return false;
        }

        // Only handle if it looks like markdown
        if (!markdownCandidate) {
          return false;
        }

        const checklistContent = isSelectionInsideChecklistItem(selection)
          ? parseSingleChecklistItemContent(text)
          : null;
        const selectionSnapshot = captureSelectionSnapshot(selection);
        const pasteLoadKey = currentLoadKeyRef.current;

        event.preventDefault();

        if (checklistContent !== null) {
          editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
              return;
            }

            selection.insertText(checklistContent);
          });
          return true;
        }

        const singleFencedCodeBlock = parseSingleFencedCodeBlock(text);

        if (singleFencedCodeBlock) {
          editor.update(() => {
            const codeNode = $createCodeNode(singleFencedCodeBlock.language);
            if (singleFencedCodeBlock.code.length > 0) {
              codeNode.append($createTextNode(singleFencedCodeBlock.code));
            }
            insertBlockNodes([codeNode]);
          });
          return true;
        }

        pasteQueueRef.current = pasteQueueRef.current
          .catch(() => {})
          .then(() =>
            processMarkdownPasteRender({
              currentLoadKeyRef: currentLoadKeyRef as LoadKeyRef,
              editor,
              pasteLoadKey,
              selectionSnapshot,
              text,
            }),
          );

        return true;
      },
      COMMAND_PRIORITY_CRITICAL,
    );
  }, [editor]);

  return null;
}
