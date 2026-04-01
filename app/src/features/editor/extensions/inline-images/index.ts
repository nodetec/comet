import {
  EditorSelection,
  type EditorState,
  type Extension,
  Prec,
} from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

import { resolveImageSrc } from "@/shared/lib/attachments";

type InlineImageMatch = {
  altText: string;
  from: number;
  src: string;
  to: number;
};

const INLINE_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

function isInsideCodeBlock(
  tree: ReturnType<typeof syntaxTree>,
  pos: number,
): boolean {
  const node = tree.resolveInner(pos, 1);
  for (let n: typeof node | null = node; n; n = n.parent) {
    if (
      n.name === "FencedCode" ||
      n.name === "CodeBlock" ||
      n.name === "InlineCode"
    ) {
      return true;
    }
  }
  return false;
}

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
    wrapper.className = "cm-inline-image cm-inline-image-loading";

    const image = document.createElement("img");
    image.className = "cm-inline-image-element";
    image.alt = this.altText;
    image.draggable = false;
    image.src = resolveImageSrc(this.src);
    image.addEventListener("load", () => {
      wrapper.classList.remove("cm-inline-image-loading");
    });
    image.addEventListener("error", () => {
      wrapper.classList.remove("cm-inline-image-loading");
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

    wrapper.dataset.from = String(this.from);
    wrapper.dataset.to = String(this.to);
    wrapper.append(image);
    return wrapper;
  }
}

export function findInlineImages(state: EditorState): InlineImageMatch[] {
  const doc = state.doc.toString();
  const tree = syntaxTree(state);
  const matches: InlineImageMatch[] = [];
  const regex = new RegExp(INLINE_IMAGE_REGEX.source, "g");

  let m;
  while ((m = regex.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;

    if (isInsideCodeBlock(tree, from)) {
      continue;
    }

    matches.push({
      altText: m[1] ?? "",
      from,
      src: m[2] ?? "",
      to,
    });
  }

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

function syncImageSelectionState(view: EditorView) {
  const sel = view.state.selection.main;
  for (const el of view.contentDOM.querySelectorAll(".cm-inline-image")) {
    if (!(el instanceof HTMLElement)) {
      continue;
    }
    const from = Number(el.dataset.from);
    const to = Number(el.dataset.to);
    const isSelected = !sel.empty && from < sel.to && to > sel.from;
    el.classList.toggle("cm-inline-image-selected", isSelected);
  }
}

const inlineImagePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildInlineImageDecorations(view.state);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = buildInlineImageDecorations(update.state);
      }

      if (update.selectionSet || update.docChanged) {
        syncImageSelectionState(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const inlineImageTheme = EditorView.baseTheme({
  ".cm-inline-image": {
    display: "inline-flex",
    maxWidth: "100%",
    // paddingBlock: "0.25rem",
    verticalAlign: "top",
  },
  ".cm-inline-image-loading": {
    minHeight: "4rem",
    minWidth: "8rem",
    backgroundColor: "color-mix(in oklab, var(--muted) 40%, transparent)",
  },
  ".cm-inline-image-element": {
    display: "block",
    maxHeight: "min(24rem, 50vh)",
    maxWidth: "min(100%, 32rem)",
    objectFit: "contain",
    userSelect: "none",
  },
  ".cm-inline-image-selected": {
    position: "relative",
  },
  ".cm-inline-image-selected::after": {
    content: '""',
    position: "absolute",
    inset: "0",
    backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
    pointerEvents: "none",
  },
  ".cm-inline-image[data-image-state='broken']": {
    alignItems: "center",
    backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
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
    inlineImagePlugin,
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
