import {
  EditorSelection,
  type EditorState,
  type Extension,
  Prec,
  RangeSetBuilder,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView, keymap, WidgetType } from "@codemirror/view";

import { resolveImageSrc } from "@/shared/lib/attachments";

type InlineImageMatch = {
  altText: string;
  from: number;
  src: string;
  to: number;
};

const IMAGE_MARKDOWN_PATTERN = /^!\[([^\]]*)\]\(([^)]+)\)$/;

class InlineImageWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly src: string,
    private readonly altText: string,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof InlineImageWidget &&
      other.from === this.from &&
      other.to === this.to &&
      other.src === this.src &&
      other.altText === this.altText
    );
  }

  override ignoreEvent(): boolean {
    return false;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-inline-image";

    const image = document.createElement("img");
    image.className = "cm-inline-image-element";
    image.alt = this.altText;
    image.draggable = false;
    image.loading = "lazy";
    image.src = resolveImageSrc(this.src);
    image.addEventListener("error", () => {
      wrapper.dataset.imageState = "broken";
      wrapper.textContent = this.altText || "Image unavailable";
    });
    image.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect = image.getBoundingClientRect();
      const position =
        event.clientX < rect.left + rect.width / 2 ? this.from : this.to;

      view.dispatch({
        selection: EditorSelection.cursor(position),
      });
      view.focus();
    });

    wrapper.append(image);
    return wrapper;
  }
}

function matchInlineImage(
  markdown: string,
): null | { altText: string; src: string } {
  const match = IMAGE_MARKDOWN_PATTERN.exec(markdown);
  if (!match) {
    return null;
  }

  return {
    altText: match[1] ?? "",
    src: match[2] ?? "",
  };
}

export function findInlineImages(state: EditorState): InlineImageMatch[] {
  const doc = state.doc.toString();
  const matches: InlineImageMatch[] = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Image") {
        return;
      }

      const parsed = matchInlineImage(doc.slice(node.from, node.to));
      if (!parsed) {
        return;
      }

      matches.push({
        altText: parsed.altText,
        from: node.from,
        src: parsed.src,
        to: node.to,
      });
    },
  });

  return matches;
}

export function findInlineImageBeforeCursor(
  state: EditorState,
  cursor: number,
): InlineImageMatch | null {
  for (const match of findInlineImages(state)) {
    if (match.to === cursor) {
      return match;
    }
  }

  return null;
}

function buildInlineImageDecorations(state: EditorState) {
  const builder = new RangeSetBuilder<Decoration>();

  for (const match of findInlineImages(state)) {
    builder.add(
      match.from,
      match.to,
      Decoration.replace({
        inclusive: false,
        widget: new InlineImageWidget(
          match.from,
          match.to,
          match.src,
          match.altText,
        ),
      }),
    );
  }

  return builder.finish();
}

const inlineImageField = EditorView.decorations.compute(["doc"], (state) =>
  buildInlineImageDecorations(state),
);

const inlineImageTheme = EditorView.baseTheme({
  ".cm-inline-image": {
    display: "inline-flex",
    maxWidth: "100%",
    paddingBlock: "0.25rem",
    verticalAlign: "top",
  },
  ".cm-inline-image-element": {
    borderRadius: "calc(var(--radius) + 0.25rem)",
    display: "block",
    maxHeight: "min(24rem, 50vh)",
    maxWidth: "min(100%, 32rem)",
    objectFit: "contain",
    userSelect: "none",
  },
  ".cm-inline-image[data-image-state='broken']": {
    alignItems: "center",
    backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
    borderRadius: "calc(var(--radius) + 0.25rem)",
    color: "var(--muted-foreground)",
    display: "inline-flex",
    fontSize: "0.875rem",
    minHeight: "8rem",
    paddingInline: "1rem",
  },
});

function deleteInlineImageBackward(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const image = findInlineImageBeforeCursor(view.state, selection.head);
  if (!image) {
    return false;
  }

  view.dispatch({
    changes: {
      from: image.from,
      to: image.to,
    },
    selection: EditorSelection.cursor(image.from),
  });

  return true;
}

export function inlineImages(): Extension {
  return [
    inlineImageField,
    inlineImageTheme,
    Prec.high(
      keymap.of([
        {
          key: "Backspace",
          run: deleteInlineImageBackward,
        },
      ]),
    ),
  ];
}
