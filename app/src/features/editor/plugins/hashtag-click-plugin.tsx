import { useCallback, useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { dispatchFocusTagPath } from "@/shared/lib/tag-navigation";

function getHashtagTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest<HTMLElement>("[data-comet-tag-path]");
}

export default function HashtagClickPlugin() {
  const [editor] = useLexicalComposerContext();

  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }

    const target = getHashtagTarget(event.target);
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) {
      event.stopImmediatePropagation();
    }
  }, []);

  const handleClick = useCallback((event: MouseEvent) => {
    const target = getHashtagTarget(event.target);
    const tagPath = target?.dataset.cometTagPath;
    if (!tagPath) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if ("stopImmediatePropagation" in event) {
      event.stopImmediatePropagation();
    }

    dispatchFocusTagPath(tagPath);
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
