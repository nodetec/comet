import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createParagraphNode } from "lexical";
import { $isLinkNode, LinkNode } from "@lexical/link";
import { $createYouTubeNode } from "../nodes/youtube-node";
import { extractYouTubeVideoId, isYouTubeUrl } from "../lib/youtube-utils";

/**
 * Automatically converts LinkNodes with YouTube URLs into YouTubeNode embeds.
 * This handles the case where a YouTube URL was previously saved as a markdown
 * link [url](url) before YouTube embed support was added.
 */
export default function YouTubeEmbedPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(LinkNode, (linkNode) => {
      if (!$isLinkNode(linkNode)) return;

      const url = linkNode.getURL();
      if (!isYouTubeUrl(url)) return;

      const videoId = extractYouTubeVideoId(url);
      if (!videoId) return;

      const youtubeNode = $createYouTubeNode(videoId);
      const parent = linkNode.getParent();

      if (parent && parent.getChildrenSize() === 1) {
        // Link is the only child — replace the whole paragraph
        const paragraph = $createParagraphNode();
        paragraph.append(youtubeNode);
        parent.replace(paragraph);
      } else {
        // Link is inline with other content — just replace the link
        linkNode.replace(youtubeNode);
      }
    });
  }, [editor]);

  return null;
}
