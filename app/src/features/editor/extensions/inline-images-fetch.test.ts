// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import { markdown as markdownLanguage } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchBlobMock } = vi.hoisted(() => ({
  fetchBlobMock: vi.fn(),
}));

vi.mock("@/shared/api/invoke", () => ({
  fetchBlob: fetchBlobMock,
}));

vi.mock("@/shared/lib/attachments", () => ({
  extractAttachmentHash: (src: string) =>
    /^attachment:\/\/([a-f0-9]{64})\.[^/?#]+$/.exec(src)?.[1] ?? null,
  resolveImageSrc: (src: string) => src.replace("attachment://", "asset://"),
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

  return { parent, view };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise(requestAnimationFrame);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  fetchBlobMock.mockReset();
  document.body.replaceChildren();
});

describe("inline image blob fetching", () => {
  it("downloads a missing attachment image before assigning a local src", async () => {
    const hash = "a".repeat(64);
    fetchBlobMock.mockResolvedValue("downloaded");

    const { view } = createView(`![Cover](attachment://${hash}.png)`);
    await flush();

    const image = view.dom.querySelector(".cm-inline-image-element");
    const wrapper = view.dom.querySelector(".cm-inline-image");

    expect(image).toBeInstanceOf(HTMLImageElement);
    expect(wrapper).toBeInstanceOf(HTMLSpanElement);

    expect(fetchBlobMock).toHaveBeenCalledWith(hash);
    expect(image?.getAttribute("src")).toContain("asset://");
    image?.dispatchEvent(new Event("load"));
    expect((wrapper as HTMLElement | null)?.style.display ?? "").toBe("");

    view.destroy();
  });

  it("hides the image when blob metadata is missing", async () => {
    const hash = "b".repeat(64);
    fetchBlobMock.mockResolvedValue("missing");

    const { view } = createView(`![Cover](attachment://${hash}.png)`);
    await flush();

    const wrapper = view.dom.querySelector(".cm-inline-image");

    await flush();

    expect(fetchBlobMock).toHaveBeenCalledWith(hash);
    expect((wrapper as HTMLElement | null)?.style.display).toBe("none");

    view.destroy();
  });
});
