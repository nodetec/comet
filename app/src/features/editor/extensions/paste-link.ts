import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { invoke } from "@tauri-apps/api/core";

const URL_RE = /^https?:\/\/\S+$/;

const YOUTUBE_URL_RE =
  /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[a-zA-Z0-9_-]{11}/;

function extractLinkFromHtml(html: string): {
  title: string;
  url: string;
} | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const anchor = doc.querySelector("a[href]");
  if (!anchor) {
    return null;
  }

  const url = anchor.getAttribute("href");
  const title = anchor.textContent?.trim() ?? "";
  if (!url) {
    return null;
  }

  return { title, url };
}

function domainLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const bare = hostname.replace(/^www\./, "");
    const parts = bare.split(".");
    return parts.length > 1 ? (parts.at(-2) ?? bare) : bare;
  } catch {
    return url;
  }
}

function formatLink(title: string, url: string): string {
  if (YOUTUBE_URL_RE.test(url)) {
    return `![${title}](${url})`;
  }
  return `[${title}](${url})`;
}

export function pasteLink() {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return false;
      }

      const plainText = clipboardData.getData("text/plain").trim();
      if (!URL_RE.test(plainText)) {
        return false;
      }

      // Check clipboard HTML for a title (e.g. copied link element)
      const html = clipboardData.getData("text/html");
      const extracted = html ? extractLinkFromHtml(html) : null;
      const clipboardHtmlTitle =
        extracted?.title && extracted.title !== extracted.url
          ? extracted.title
          : null;

      event.preventDefault();

      if (clipboardHtmlTitle) {
        // We already have a title — insert immediately.
        const markdown = formatLink(clipboardHtmlTitle, plainText);
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: markdown },
          selection: EditorSelection.cursor(from + markdown.length),
        });
      } else {
        // Resolve title via backend (pasteboard + fetch), then insert.
        const { from, to } = view.state.selection.main;
        void invoke<string | null>("resolve_url_title", {
          url: plainText,
        })
          .catch(() => null)
          .then((resolvedTitle) => {
            const title = resolvedTitle ?? domainLabel(plainText);
            const markdown = formatLink(title, plainText);
            view.dispatch({
              changes: { from, to, insert: markdown },
              selection: EditorSelection.cursor(from + markdown.length),
            });
          });
      }

      return true;
    },
  });
}
