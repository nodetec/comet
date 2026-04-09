// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/invoke", () => ({
  fetchBlob: vi.fn(),
}));

vi.mock("@/shared/lib/attachments", () => ({
  extractAttachmentHash: () => null,
  resolveImageSrc: (src: string) => src,
}));

import { inlineImages } from "@/features/editor/extensions/inline-images";

function createView(doc: string) {
  const parent = document.createElement("div");
  document.body.append(parent);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [markdownLanguage(), inlineImages()],
    }),
  });

  return { view };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("inline youtube embeds", () => {
  it("renders embeds with explicit player params and referrer policy", () => {
    const { view } = createView("![Demo](https://youtu.be/dQw4w9WgXcQ)");

    const iframe = view.dom.querySelector(".cm-inline-youtube-element");

    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(iframe?.getAttribute("src")).toContain(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(iframe?.getAttribute("src")).toContain("playsinline=1");
    expect(iframe?.getAttribute("src")).toContain("rel=0");
    expect((iframe as HTMLIFrameElement | null)?.referrerPolicy).toBe(
      "strict-origin-when-cross-origin",
    );

    view.destroy();
  });
});
