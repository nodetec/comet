import type { ElementTransformer } from "@lexical/markdown";
import { $createParagraphNode, type ElementNode, type LexicalNode } from "lexical";
import {
  $createYouTubeNode,
  $isYouTubeNode,
  YouTubeNode,
} from "../nodes/youtube-node";

function extractYouTubeVideoId(text: string): string | null {
  const match = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/.exec(text);
  return match?.[2] && match[2].length === 11 ? match[2] : null;
}

function isYouTubeUrl(text: string): boolean {
  return (
    text.includes("youtube.com") ||
    text.includes("youtu.be") ||
    text.includes("youtube-nocookie.com")
  );
}

export const YOUTUBE: ElementTransformer = {
  dependencies: [YouTubeNode],
  export: (node: LexicalNode) => {
    if (!$isYouTubeNode(node)) {
      return null;
    }
    return `https://www.youtube.com/watch?v=${node.getId()}`;
  },
  regExp:
    /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\S+$/,
  replace: (
    parentNode: ElementNode,
    _children: LexicalNode[],
    match: string[],
  ) => {
    const url = match[0];

    if (!url || !isYouTubeUrl(url)) {
      return;
    }

    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      return;
    }

    const youTubeNode = $createYouTubeNode(videoId);
    const paragraph = $createParagraphNode();
    paragraph.append(youTubeNode);
    parentNode.replace(paragraph);
  },
  type: "element",
};
