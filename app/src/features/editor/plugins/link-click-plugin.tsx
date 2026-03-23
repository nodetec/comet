import { useCallback, useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { openUrl } from "@tauri-apps/plugin-opener";

function getAnchorTarget(target: EventTarget | null) {
  return target instanceof Element ? target.closest("a") : null;
}

function isExternalLink(href: string) {
  try {
    const url = new URL(href, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function LinkClickPlugin() {
  const [editor] = useLexicalComposerContext();

  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }

    const anchor = getAnchorTarget(event.target);
    if (!anchor) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) {
      event.stopImmediatePropagation();
    }
  }, []);

  const handleClick = useCallback((event: MouseEvent) => {
    const anchor = getAnchorTarget(event.target);
    if (!anchor) {
      return;
    }

    const href = anchor.getAttribute("href") || "";
    if (href.startsWith("#")) {
      event.preventDefault();
      event.stopPropagation();
      if ("stopImmediatePropagation" in event) {
        event.stopImmediatePropagation();
      }

      const targetId = href.slice(1);
      if (!targetId) {
        return;
      }

      const targetElement = document.querySelector(`#${CSS.escape(targetId)}`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    if (!isExternalLink(href)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) {
      event.stopImmediatePropagation();
    }

    void openUrl(href).catch(() => {});
  }, []);

  useEffect(() => {
    return editor.registerRootListener((root, prevRoot) => {
      if (prevRoot) {
        prevRoot.removeEventListener("mousedown", handleMouseDown, true);
        prevRoot.removeEventListener("click", handleClick);
      }
      if (root) {
        root.addEventListener("mousedown", handleMouseDown, true);
        root.addEventListener("click", handleClick);
      }
    });
  }, [editor, handleClick, handleMouseDown]);

  return null;
}
