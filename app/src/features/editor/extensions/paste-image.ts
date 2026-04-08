import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { importImageBytes, unresolveImageSrc } from "@/shared/lib/attachments";

function getImageItem(clipboardData: DataTransfer): DataTransferItem | null {
  for (const item of clipboardData.items) {
    if (item.type.startsWith("image/")) {
      return item;
    }
  }
  return null;
}

export function pasteImage() {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return false;

      const imageItem = getImageItem(clipboardData);
      if (!imageItem) return false;

      const file = imageItem.getAsFile();
      if (!file) return false;

      event.preventDefault();

      const { from, to } = view.state.selection.main;
      const placeholder = "![uploading...]()";
      view.dispatch({
        changes: { from, to, insert: placeholder },
        selection: EditorSelection.cursor(from + placeholder.length),
      });

      void file
        .arrayBuffer()
        .then(async (buffer) => {
          const bytes = new Uint8Array(buffer);
          const imported = await importImageBytes(bytes);
          const src = unresolveImageSrc(imported.assetUrl);
          const markdown = `![${imported.altText}](${src})`;

          const current = view.state.sliceDoc(from, from + placeholder.length);
          if (current !== placeholder) return;

          view.dispatch({
            changes: {
              from,
              to: from + placeholder.length,
              insert: markdown,
            },
          });
        })
        .catch(() => {
          const current = view.state.sliceDoc(from, from + placeholder.length);
          if (current !== placeholder) return;

          view.dispatch({
            changes: { from, to: from + placeholder.length, insert: "" },
          });
        });

      return true;
    },
  });
}
