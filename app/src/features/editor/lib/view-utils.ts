import { EditorView } from "@codemirror/view";

const EDITOR_CONTENT_CLASS = "comet-editor-content";
const EDITOR_SCROLL_CONTAINER_SELECTOR = "[data-editor-scroll-container]";

export function findEditorScrollContainer(
  view: EditorView,
): HTMLElement | null {
  const container = view.dom.closest(EDITOR_SCROLL_CONTAINER_SELECTOR);
  return container instanceof HTMLElement ? container : null;
}

export function getEditorScrollContainer(view: EditorView): HTMLElement {
  return findEditorScrollContainer(view) ?? view.scrollDOM;
}

export function lockEditorScrollPosition(
  scrollContainer: HTMLElement,
  scrollTop: number,
) {
  scrollContainer.scrollTop = scrollTop;
  const lock = () => {
    scrollContainer.scrollTop = scrollTop;
  };
  scrollContainer.addEventListener("scroll", lock);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollContainer.removeEventListener("scroll", lock);
    });
  });
}

export function createEditorContentAttributes(spellCheck: boolean) {
  return EditorView.contentAttributes.of({
    autocapitalize: "off",
    autocorrect: "off",
    class: EDITOR_CONTENT_CLASS,
    spellcheck: spellCheck ? "true" : "false",
  });
}
