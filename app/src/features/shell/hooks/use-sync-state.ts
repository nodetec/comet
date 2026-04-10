import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function useSyncState() {
  const [syncState, setSyncState] = useState<string>("disconnected");

  useEffect(() => {
    invoke<string | { error: { message: string } }>("get_sync_status")
      .then((s) => {
        setSyncState(typeof s === "string" ? s : "error");
      })
      .catch(() => {});
    const unlisten = listen<{ state: string | { error: { message: string } } }>(
      "sync-status",
      (event) => {
        const s = event.payload.state;
        setSyncState(typeof s === "string" ? s : "error");
      },
    );
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  return syncState;
}
