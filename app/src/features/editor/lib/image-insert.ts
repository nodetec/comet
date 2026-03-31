import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $setSelection,
} from "lexical";

import { $createImageNode } from "../nodes/image-node";

export type ImportedEditorImage = {
  altText: string;
  assetUrl: string;
};

export function $insertImportedImages(
  results: Array<ImportedEditorImage | null>,
): void {
  for (const result of results) {
    if (!result) {
      continue;
    }

    const imageNode = $createImageNode({
      src: result.assetUrl,
      altText: result.altText,
    });
    const selection = $getSelection();
    if ($isNodeSelection(selection)) {
      const nodes = selection.getNodes();
      const [lastNode] = nodes.slice(-1);
      lastNode.getTopLevelElementOrThrow().insertAfter(imageNode);
    } else if (selection) {
      selection.insertNodes([imageNode]);
    } else {
      $getRoot().append(imageNode);
    }

    const nodeSelection = $createNodeSelection();
    nodeSelection.add(imageNode.getKey());
    $setSelection(nodeSelection);
  }
}
