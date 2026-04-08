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

import { overlapsAny } from "@/features/editor/extensions/markdown-decorations/cursor";
import type { SearchMatch } from "@/shared/lib/search";
import { collectSearchMatches } from "@/shared/lib/search";
import { resolveImageSrc } from "@/shared/lib/attachments";

const VISIBLE_RANGE_MARGIN = 1000;

type InlineImageMatch = {
  altText: string;
  from: number;
  src: string;
  to: number;
};

const INLINE_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

const YOUTUBE_URL_RE =
  /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/;

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
    wrapper.className = "cm-inline-image";

    const image = document.createElement("img");
    image.className = "cm-inline-image-element";
    image.alt = this.altText;
    image.draggable = false;
    image.src = resolveImageSrc(this.src);
    image.addEventListener("error", () => {
      wrapper.style.display = "none";
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

function extractYouTubeVideoId(src: string): string | null {
  const match = YOUTUBE_URL_RE.exec(src);
  return match ? (match[1] ?? null) : null;
}

class InlineYouTubeWidget extends WidgetType {
  private readonly videoId: string;

  constructor(
    private readonly from: number,
    private readonly to: number,
    videoId: string,
  ) {
    super();
    this.videoId = videoId;
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof InlineYouTubeWidget &&
      other.from === this.from &&
      other.to === this.to &&
      other.videoId === this.videoId
    );
  }

  override ignoreEvent(): boolean {
    return false;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-inline-youtube";

    const iframe = document.createElement("iframe");
    iframe.className = "cm-inline-youtube-element";
    iframe.src = `https://www.youtube-nocookie.com/embed/${this.videoId}`;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;

    wrapper.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || event.target === iframe) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect = wrapper.getBoundingClientRect();
      const position =
        event.clientX < rect.left + rect.width / 2 ? this.from : this.to;

      view.dispatch({
        selection: EditorSelection.cursor(position),
      });
      view.focus();
    });

    wrapper.append(iframe);
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

function findInlineImagesInRanges(
  state: EditorState,
  ranges: readonly { from: number; to: number }[],
): InlineImageMatch[] {
  const tree = syntaxTree(state);
  const matches: InlineImageMatch[] = [];

  for (const range of ranges) {
    const slice = state.doc.sliceString(range.from, range.to);
    const regex = new RegExp(INLINE_IMAGE_REGEX.source, "g");

    let m;
    while ((m = regex.exec(slice)) !== null) {
      const from = range.from + m.index;
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
  }

  return matches;
}

function buildInlineImageDecorations(
  view: EditorView,
  searchMatches: SearchMatch[],
) {
  const builder = new RangeSetBuilder<Decoration>();
  const docLength = view.state.doc.length;
  const ranges = view.visibleRanges.map(({ from, to }) => ({
    from: Math.max(0, from - VISIBLE_RANGE_MARGIN),
    to: Math.min(docLength, to + VISIBLE_RANGE_MARGIN),
  }));

  for (const match of findInlineImagesInRanges(view.state, ranges)) {
    if (overlapsAny(match.from, match.to, searchMatches)) {
      continue;
    }

    const youtubeId = extractYouTubeVideoId(match.src);
    const widget = youtubeId
      ? new InlineYouTubeWidget(match.from, match.to, youtubeId)
      : new InlineImageWidget(match.from, match.to, match.src, match.altText);

    builder.add(
      match.from,
      match.to,
      Decoration.replace({ inclusive: false, widget }),
    );
  }

  return builder.finish();
}

function inlineImagePlugin(searchQuery = "") {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      searchMatches: SearchMatch[];

      constructor(view: EditorView) {
        this.searchMatches = collectSearchMatches(
          view.state.doc.toString(),
          searchQuery,
        );
        this.decorations = buildInlineImageDecorations(
          view,
          this.searchMatches,
        );
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          syntaxTree(update.state) !== syntaxTree(update.startState)
        ) {
          if (update.docChanged) {
            this.searchMatches = collectSearchMatches(
              update.state.doc.toString(),
              searchQuery,
            );
          }
          this.decorations = buildInlineImageDecorations(
            update.view,
            this.searchMatches,
          );
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

const inlineImageTheme = EditorView.baseTheme({
  ".cm-inline-image": {
    display: "inline-flex",
    maxWidth: "100%",
    verticalAlign: "top",
  },
  ".cm-inline-image-element": {
    display: "block",
    maxHeight: "min(24rem, 50vh)",
    maxWidth: "100%",
    objectFit: "contain",
    userSelect: "none",
  },
  ".cm-inline-youtube": {
    display: "inline-flex",
    maxWidth: "100%",
    verticalAlign: "top",
    width: "min(100%, 32rem)",
  },
  ".cm-inline-youtube-element": {
    aspectRatio: "16 / 9",
    border: "none",
    borderRadius: "var(--radius-md, 0.375rem)",
    display: "block",
    width: "100%",
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

type InlineImagesOptions = {
  searchQuery?: string;
};

export function inlineImages(options: InlineImagesOptions = {}): Extension {
  return [
    inlineImagePlugin(options.searchQuery),
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
