import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createTextNode,
  $createParagraphNode,
  $insertNodes,
  PASTE_COMMAND,
  COMMAND_PRIORITY_HIGH,
} from "lexical";
import { $createLinkNode } from "@lexical/link";
import { $createYouTubeNode } from "../nodes/youtube-node";

const URL_REGEX = /^https?:\/\/[^\s]+$/;

function isValidUrl(text: string): boolean {
  return URL_REGEX.test(text.trim());
}

function isYouTubeUrl(text: string): boolean {
  return (
    text.includes("youtube.com") ||
    text.includes("youtu.be") ||
    text.includes("youtube-nocookie.com")
  );
}

function extractYouTubeVideoId(text: string): string | null {
  const match =
    /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/.exec(text);
  return match?.[2] && match[2].length === 11 ? match[2] : null;
}

function getLinkAttributes(url: string) {
  if (url.startsWith("#")) {
    return undefined;
  }
  return { target: "_blank", rel: "noopener noreferrer" };
}

// Check if cursor is inside markdown link/image syntax like [text]( or ![alt](
function isInsideMarkdownLinkSyntax(
  selection: ReturnType<typeof $getSelection>,
): boolean {
  if (!$isRangeSelection(selection)) return false;

  const anchorNode = selection.anchor.getNode();
  if (!$isTextNode(anchorNode)) return false;

  const textContent = anchorNode.getTextContent();
  const offset = selection.anchor.offset;
  const textBeforeCursor = textContent.slice(0, offset);

  // Check if we're right after ]( which indicates markdown link/image syntax
  // Patterns: [text]( or ![alt](
  return /\]\($/.test(textBeforeCursor);
}

export default function LinkPastePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const text = clipboardData.getData("text/plain").trim();

        // Only handle if it's a valid URL
        if (!isValidUrl(text)) return false;

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        // Don't intercept if we're inside markdown link/image syntax
        // Let the user complete the markdown pattern manually
        if (isInsideMarkdownLinkSyntax(selection)) return false;

        event.preventDefault();

        // Handle YouTube URLs as embeds
        if (isYouTubeUrl(text)) {
          const videoId = extractYouTubeVideoId(text);
          if (videoId) {
            const youtubeNode = $createYouTubeNode(videoId);
            const paragraphAfter = $createParagraphNode();
            $insertNodes([youtubeNode, paragraphAfter]);
            paragraphAfter.selectStart();
            return true;
          }
        }

        // Create link with URL as display text
        const linkNode = $createLinkNode(text, getLinkAttributes(text));
        linkNode.append($createTextNode(text));
        selection.insertNodes([linkNode]);

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor]);

  return null;
}
