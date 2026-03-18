import type { ElementTransformer } from "@lexical/markdown";
import {
  $createParagraphNode,
  type ElementNode,
  type LexicalNode,
} from "lexical";
import {
  $createYouTubeNode,
  $isYouTubeNode,
  YouTubeNode,
} from "../nodes/youtube-node";
import { extractYouTubeVideoId, isYouTubeUrl } from "../lib/youtube-utils";

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
