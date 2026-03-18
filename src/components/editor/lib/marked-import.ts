import { Marked, type MarkedExtension, type Tokens } from "marked";
import { resolveImageSrc } from "@/lib/attachments";
import { extractYouTubeVideoId } from "./youtube-utils";

/**
 * Block-level extension: bare YouTube URLs on their own line become embeds.
 * Renders an <iframe data-lexical-youtube="videoId"> that YouTubeNode.importDOM
 * picks up.
 */
const youtubeExtension: MarkedExtension = {
  extensions: [
    {
      name: "youtube",
      level: "block",
      start(src) {
        return src.match(
          /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)/m,
        )?.index;
      },
      tokenizer(src) {
        const match =
          /^(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\S+)\n?/.exec(
            src,
          );
        if (match) {
          const videoId = extractYouTubeVideoId(match[1]);
          if (videoId) {
            return { type: "youtube", raw: match[0], videoId };
          }
        }
        return undefined;
      },
      renderer(token) {
        const { videoId } = token as Tokens.Generic & { videoId: string };
        return `<iframe data-lexical-youtube="${videoId}" width="560" height="315" src="https://www.youtube-nocookie.com/embed/${videoId}" frameborder="0" allowfullscreen="true" title="YouTube video"></iframe>\n`;
      },
    },
  ],
};

/**
 * Inline extension: ==highlighted text== → <mark>text</mark>
 * Marked doesn't support this natively; we need it for roundtrip fidelity
 * since our editor supports highlight via TEXT_FORMAT_TRANSFORMERS.
 */
const highlightExtension: MarkedExtension = {
  extensions: [
    {
      name: "highlight",
      level: "inline",
      start(src) {
        return src.indexOf("==");
      },
      tokenizer(src) {
        if (!src.startsWith("==")) return undefined;
        const content = src.slice(2);
        const endIdx = content.indexOf("==");
        if (endIdx > 0) {
          const text = content.slice(0, endIdx);
          return {
            type: "highlight",
            raw: `==${text}==`,
            text,
            tokens: this.lexer.inlineTokens(text),
          };
        }
        return undefined;
      },
      renderer(token) {
        const t = token as Tokens.Generic & { tokens: unknown[] };
        return `<mark>${this.parser.parseInline(t.tokens as Tokens.Generic[])}</mark>`;
      },
      childTokens: ["tokens"],
    },
  ],
};

/**
 * Renderer overrides to bridge marked's HTML output to what Lexical's
 * importDOM expects.
 */
const rendererOverrides: MarkedExtension = {
  renderer: {
    // Code blocks: Lexical's CodeNode.importDOM reads `data-language` from
    // <pre>, but marked outputs <pre><code class="language-js">. We rewrite
    // to match Lexical's expectation.
    code({ text, lang }: Tokens.Code) {
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
      const langAttr = lang ? ` data-language="${lang}"` : "";
      return `<pre${langAttr}><code>${escaped}</code></pre>\n`;
    },

    // Strikethrough: marked outputs <del>, Lexical's TextNode.importDOM
    // handles <s> but not <del>.
    del({ tokens }: Tokens.Del) {
      return `<s>${this.parser.parseInline(tokens)}</s>`;
    },

    // Images: resolve attachment:// URIs for rendering.
    image({ href, title, text }: Tokens.Image) {
      const resolved = resolveImageSrc(href);
      const titleAttr = title ? ` title="${title}"` : "";
      return `<img src="${resolved}" alt="${text}"${titleAttr}>`;
    },

    // Checklists: Lexical's isDomChecklist() looks for "contains-task-list"
    // on <ul> and "task-list-item" on <li>. Marked doesn't add these classes.
    list({ items, ordered, start }: Tokens.List) {
      const hasCheckbox = items.some((item) => item.task);
      const tag = ordered ? "ol" : "ul";
      const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
      const checkClass = hasCheckbox ? ' class="contains-task-list"' : "";
      const body = items.map((item) => this.listitem(item)).join("");
      return `<${tag}${startAttr}${checkClass}>${body}</${tag}>\n`;
    },

    listitem({ tokens, task }: Tokens.ListItem) {
      // For task items, marked already includes a checkbox token in `tokens`.
      // We just need to add the "task-list-item" class for Lexical's
      // $convertListItemElement to detect the checked state.
      const inner = this.parser.parse(tokens);
      if (task) {
        return `<li class="task-list-item">${inner}</li>\n`;
      }
      return `<li>${inner}</li>\n`;
    },
  },
};

/**
 * Preprocess hook to preserve blank lines as empty paragraphs. Marked treats
 * blank lines as paragraph separators and collapses them. We convert each
 * blank line into a <p><br></p> marker surrounded by blank lines so marked
 * still sees the block separators it needs. This matches Bear/Obsidian
 * behavior where every blank line is a visible, clickable empty paragraph.
 */
const emptyParagraphPreprocess: MarkedExtension = {
  hooks: {
    preprocess(markdown: string) {
      const lines = markdown.split("\n");
      const result: string[] = [];
      let fenceChar: string | null = null;
      let fenceLen = 0;

      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trimStart();

        // Track code fence state (proper fence matching)
        const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
        if (fenceMatch && !/^(`{3,})[^`]+\1$/.test(line)) {
          const char = fenceMatch[1][0];
          const len = fenceMatch[1].length;
          if (fenceChar === null) {
            fenceChar = char;
            fenceLen = len;
          } else if (char === fenceChar && len >= fenceLen) {
            fenceChar = null;
          }
          result.push(line);
          i++;
          continue;
        }

        // Inside code fence — preserve as-is
        if (fenceChar !== null) {
          result.push(line);
          i++;
          continue;
        }

        // Blank line group: each blank becomes an empty paragraph marker.
        // We surround each marker with blank lines so marked still sees
        // block separators between adjacent content.
        if (line.trim() === "") {
          let blankCount = 0;
          while (i < lines.length && lines[i].trim() === "") {
            blankCount++;
            i++;
          }
          for (let j = 0; j < blankCount; j++) {
            result.push("");
            result.push("<p><br></p>");
          }
          result.push("");
        } else {
          result.push(line);
          i++;
        }
      }

      return result.join("\n");
    },
  },
};

// ---------------------------------------------------------------------------
// Configured Marked instance
// ---------------------------------------------------------------------------

const markedInstance = new Marked();
markedInstance.use(
  { gfm: true, breaks: true },
  youtubeExtension,
  highlightExtension,
  rendererOverrides,
  emptyParagraphPreprocess,
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a markdown string to a DOM Document suitable for
 * `$generateNodesFromDOM()`.
 */
const domParser = new DOMParser();

export function markdownToDOM(markdown: string): Document {
  const html = markedInstance.parse(markdown) as string;
  return domParser.parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );
}
