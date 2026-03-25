import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ChevronRight,
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudOff,
  CloudSync,
  Database,
  HardDrive,
  Image,
  Key,
  ScrollText,
  X,
} from "lucide-react";

import {
  DialogBackdrop,
  DialogClose,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { cn, errorMessage } from "@/shared/lib/utils";

type SyncInfo = {
  state: string | { error: { message: string } };
  relayUrl: string | null;
  relayUrls: string[];
  activeRelayUrl: string | null;
  preferredRelayUrl: string | null;
  blossomUrl: string | null;
  npub: string | null;
  syncedNotes: number;
  pendingNotes: number;
  totalNotes: number;
  checkpointSeq: number | null;
  blobsStored: number;
};

function stateLabel(state: SyncInfo["state"]): {
  label: string;
  icon: React.ReactNode;
} {
  if (typeof state !== "string") {
    return {
      label: "Error",
      icon: <CloudAlert className="text-destructive size-4" />,
    };
  }
  switch (state) {
    case "connected": {
      return {
        label: "Connected",
        icon: <CloudCheck className="size-4" />,
      };
    }
    case "needsUnlock": {
      return {
        label: "Needs Unlock",
        icon: <CloudAlert className="size-4 text-amber-500" />,
      };
    }
    case "syncing": {
      return {
        label: "Syncing",
        icon: <CloudSync className="size-4 animate-pulse" />,
      };
    }
    case "connecting": {
      return {
        label: "Connecting",
        icon: <CloudSync className="size-4 animate-pulse" />,
      };
    }
    case "authenticating": {
      return {
        label: "Authenticating",
        icon: <CloudSync className="size-4 animate-pulse" />,
      };
    }
    case "disconnected": {
      return {
        label: "Disconnected",
        icon: <CloudOff className="size-4" />,
      };
    }
    default: {
      return {
        label: state,
        icon: <Cloud className="size-4" />,
      };
    }
  }
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        {icon}
        {label}
      </div>
      <span className="text-secondary-foreground max-w-[60%] truncate text-xs">
        {value}
      </span>
    </div>
  );
}

function SyncInfoPanel({ info }: { info: SyncInfo }) {
  return (
    <div className="divide-accent/30 divide-y">
      {info.activeRelayUrl ? (
        <InfoRow
          icon={<Database className="size-3.5" />}
          label="Active relay"
          value={info.activeRelayUrl.replace(/^wss?:\/\//, "")}
        />
      ) : (
        <InfoRow
          icon={<Database className="size-3.5" />}
          label="Active relay"
          value={<span className="text-muted-foreground">Not configured</span>}
        />
      )}

      {info.relayUrls.length > 0 ? (
        <InfoRow
          icon={<Database className="size-3.5" />}
          label="Configured relays"
          value={info.relayUrls.length}
        />
      ) : null}

      {info.preferredRelayUrl &&
      info.preferredRelayUrl !== info.activeRelayUrl ? (
        <InfoRow
          icon={<Database className="size-3.5" />}
          label="Preferred relay"
          value={info.preferredRelayUrl.replace(/^wss?:\/\//, "")}
        />
      ) : null}

      <InfoRow
        icon={<HardDrive className="size-3.5" />}
        label="Notes synced"
        value={`${info.syncedNotes} / ${info.totalNotes}`}
      />

      {info.pendingNotes > 0 ? (
        <InfoRow
          icon={<CloudSync className="size-3.5" />}
          label="Pending sync"
          value={
            <span className="text-amber-400">{info.pendingNotes} unsynced</span>
          }
        />
      ) : null}

      {info.blossomUrl ? (
        <InfoRow
          icon={<Image className="size-3.5" />}
          label="Blobs"
          value={`${info.blobsStored} on ${info.blossomUrl.replace(/^https?:\/\//, "")}`}
        />
      ) : null}

      {info.npub ? (
        <InfoRow
          icon={<Key className="size-3.5" />}
          label="Identity"
          value={`${info.npub.slice(0, 16)}…`}
        />
      ) : null}

      {info.checkpointSeq == null ? null : (
        <InfoRow
          icon={<CloudSync className="size-3.5" />}
          label="Relay checkpoint"
          value={info.checkpointSeq}
        />
      )}
    </div>
  );
}

const MAX_LOGS = 100;

export function SyncDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const refreshInfo = () => invoke<SyncInfo>("get_sync_info").then(setInfo);

  useEffect(() => {
    if (!open) return;
    void refreshInfo();
  }, [open]);

  // Refresh on sync status changes while dialog is open
  useEffect(() => {
    if (!open) return;
    const unlisten = listen("sync-status", () => {
      void refreshInfo();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [open]);

  // Collect sync log events
  useEffect(() => {
    const unlisten = listen<string>("sync-log", (event) => {
      setLogs((prev) => {
        const next = [...prev, event.payload];
        return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
      });
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Auto-scroll logs when new entries arrive
  useEffect(() => {
    if (logsOpen) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logsOpen]);

  const { label, icon } = info
    ? stateLabel(info.state)
    : { label: "Loading", icon: <Cloud className="size-4" /> };
  const needsUnlock =
    info !== null &&
    typeof info.state === "string" &&
    info.state === "needsUnlock";

  const handleUnlock = async () => {
    setUnlocking(true);
    setUnlockError(null);
    try {
      await invoke("unlock_current_account");
      await refreshInfo();
    } catch (error) {
      setUnlockError(errorMessage(error, "Failed to unlock sync."));
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup className="w-96 p-4">
          <DialogClose className="absolute top-4 right-4 cursor-pointer rounded-sm opacity-70 transition-opacity hover:opacity-100">
            <X className="size-4" />
          </DialogClose>
          <DialogTitle className="mb-3 flex items-center gap-2 text-sm font-medium">
            {icon}
            Sync — {label}
          </DialogTitle>

          {info ? (
            <SyncInfoPanel info={info} />
          ) : (
            <p className="text-muted-foreground text-xs">Loading…</p>
          )}

          {needsUnlock ? (
            <div className="border-accent/30 mt-3 border-t pt-3">
              <p className="text-muted-foreground text-xs">
                Sync is configured, but this session has not unlocked the active
                account&apos;s Nostr key yet.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={unlocking}
                  onClick={() => void handleUnlock()}
                >
                  <Key
                    className={cn("size-3.5", unlocking && "animate-pulse")}
                  />
                  {unlocking ? "Unlocking..." : "Unlock Sync"}
                </Button>
                {unlockError ? (
                  <span className="text-destructive text-xs">
                    {unlockError}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Collapsible sync log */}
          <div className="border-accent/30 mt-3 border-t pt-2">
            <button
              className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 text-xs"
              onClick={() => setLogsOpen((o) => !o)}
              type="button"
            >
              <ChevronRight
                className={cn(
                  "size-3 transition-transform",
                  logsOpen && "rotate-90",
                )}
              />
              <ScrollText className="size-3" />
              Sync log ({logs.length})
            </button>

            {logsOpen && (
              <div className="bg-muted/50 mt-2 max-h-48 overflow-y-auto rounded-md p-2 font-mono text-[10px] leading-relaxed">
                {logs.length === 0 ? (
                  <span className="text-muted-foreground">
                    No log entries yet…
                  </span>
                ) : (
                  logs.map((line, i) => (
                    <div
                      key={i}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {line}
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            )}
          </div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
