import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

export function useRevealMainWindow(ready: boolean) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!ready || revealed) return;

    setRevealed(true);
    void invoke("reveal_main_window");
  }, [ready, revealed]);

  return revealed;
}
