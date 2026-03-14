import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";

export function useRevealMainWindow(bootstrapLoading: boolean) {
  const hasRevealedWindowRef = useRef(false);

  useEffect(() => {
    // The Tauri main window starts hidden to avoid startup flash. Reveal it only
    // once the initial shell state is ready, and never re-run that reveal during
    // later note/query transitions.
    if (bootstrapLoading || hasRevealedWindowRef.current) {
      return;
    }

    hasRevealedWindowRef.current = true;
    void invoke("reveal_main_window");
  }, [bootstrapLoading]);
}
