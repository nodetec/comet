import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, X } from "lucide-react";
import {
  getAccessKey,
  setAccessKey,
  clearAccessKey,
} from "@/shared/api/invoke";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { errorMessage } from "@/shared/lib/utils";

import { SettingRow } from "./setting-row";
import { useInlineEditor } from "./use-inline-editor";

type Relay = {
  url: string;
  kind: "sync" | "publish";
  createdAt: number;
  paused: boolean;
  preferred: boolean;
  active: boolean;
};

export function SyncSettings() {
  const queryClient = useQueryClient();

  const { data: currentKey } = useQuery({
    queryKey: ["access-key"],
    queryFn: getAccessKey,
  });

  const { data: relays = [] } = useQuery({
    queryKey: ["relays"],
    queryFn: () => invoke<Relay[]>("list_relays"),
  });

  const syncRelays = relays.filter((r) => r.kind === "sync");

  return (
    <div className="space-y-8">
      <AccessKeySection queryClient={queryClient} />
      {currentKey ? (
        <>
          <SyncToggle />
          <SyncRelaySection relays={syncRelays} queryClient={queryClient} />
          <BlossomSection queryClient={queryClient} />
          <ResyncSection queryClient={queryClient} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Enter an access key to enable sync.
        </p>
      )}
    </div>
  );
}

export function PublishSettings() {
  const queryClient = useQueryClient();

  const { data: relays = [] } = useQuery({
    queryKey: ["relays"],
    queryFn: () => invoke<Relay[]>("list_relays"),
  });

  const publishRelays = relays.filter((r) => r.kind === "publish");

  return (
    <div className="space-y-8">
      <PublishRelaysSection relays={publishRelays} queryClient={queryClient} />
    </div>
  );
}

function SyncToggle() {
  const queryClient = useQueryClient();

  const { data: enabled, isLoading } = useQuery({
    queryKey: ["sync-enabled"],
    queryFn: () => invoke<boolean>("is_sync_enabled"),
  });

  const toggleMutation = useMutation({
    mutationFn: (newEnabled: boolean) =>
      invoke("set_sync_enabled", { enabled: newEnabled }),
    onMutate: async (newEnabled) => {
      await queryClient.cancelQueries({ queryKey: ["sync-enabled"] });
      const previousEnabled = queryClient.getQueryData<boolean>([
        "sync-enabled",
      ]);
      queryClient.setQueryData(["sync-enabled"], newEnabled);
      return { previousEnabled };
    },
    onError: (error, _newEnabled, context) => {
      queryClient.setQueryData(["sync-enabled"], context?.previousEnabled);
      toast.error(errorMessage(error, "Couldn't update sync."));
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sync-enabled"] });
    },
  });

  if (isLoading) return null;

  return (
    <SettingRow
      label="Sync"
      description="Sync notes across your devices."
      border={false}
    >
      <Switch
        checked={enabled ?? true}
        onCheckedChange={(checked) => toggleMutation.mutate(checked)}
      />
    </SettingRow>
  );
}

function AccessKeySection({
  queryClient,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);

  const { data: currentKey } = useQuery({
    queryKey: ["access-key"],
    queryFn: getAccessKey,
  });

  const saveMutation = useMutation({
    mutationFn: (key: string) => setAccessKey(key),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["access-key"] });
      setEditing(false);
      setInput("");
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to save key.")),
  });

  const clearMutation = useMutation({
    mutationFn: () => clearAccessKey(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["access-key"] });
    },
  });

  const masked = currentKey
    ? `${currentKey.slice(0, 7)}...${currentKey.slice(-4)}`
    : null;

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">Access Key</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        API key for relay and blob storage access.
      </p>

      {masked && !editing && (
        <div className="flex items-center gap-2">
          <code className="text-muted-foreground text-xs">{masked}</code>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => clearMutation.mutate()}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {(!currentKey || editing) && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) saveMutation.mutate(input.trim());
          }}
        >
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="sk_..."
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-8 w-60 rounded-md border px-2 text-xs focus-visible:ring-1 focus-visible:outline-none"
          />
          <Button size="sm" type="submit" disabled={!input.trim()}>
            Save
          </Button>
          {currentKey && (
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          )}
        </form>
      )}
    </div>
  );
}

function SyncRelaySection({
  relays,
  queryClient,
}: {
  relays: Relay[];
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const editor = useInlineEditor();

  const addSyncMutation = useMutation({
    mutationFn: (url: string) => invoke<Relay[]>("set_sync_relay", { url }),
    onSuccess: (data) => {
      queryClient.setQueryData(["relays"], data);
      editor.close();
    },
  });

  const removeSyncMutation = useMutation({
    mutationFn: (url: string) => invoke<Relay[]>("remove_sync_relay", { url }),
    onSuccess: (data) => {
      queryClient.setQueryData(["relays"], data);
    },
  });

  const pauseSyncMutation = useMutation({
    mutationFn: ({ url, paused }: { url: string; paused: boolean }) =>
      invoke<Relay[]>("pause_sync_relay", { url, paused }),
    onSuccess: (data) => {
      queryClient.setQueryData(["relays"], data);
    },
  });

  const preferSyncMutation = useMutation({
    mutationFn: (url: string) =>
      invoke<Relay[]>("set_preferred_sync_relay", { url }),
    onSuccess: (data) => {
      queryClient.setQueryData(["relays"], data);
    },
  });

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">Sync Relays</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        Notes are pushed to every unpaused sync relay. Live sync prefers your
        preferred relay, then falls back to the next healthy relay.
      </p>

      {relays.length > 0 && !editor.editing && (
        <ul className="mb-3 space-y-1.5">
          {relays.map((relay) => (
            <li key={relay.url} className="flex items-center gap-2">
              <code className="bg-muted rounded px-2 py-1 text-sm">
                {relay.url}
              </code>
              {relay.preferred ? (
                <span className="text-muted-foreground text-xs">Preferred</span>
              ) : null}
              {relay.active ? (
                <span className="text-muted-foreground text-xs">Active</span>
              ) : null}
              {relay.paused ? (
                <span className="text-muted-foreground text-xs">Paused</span>
              ) : null}
              {relay.preferred ? null : (
                <Button
                  variant="link"
                  size="xs"
                  onClick={() => preferSyncMutation.mutate(relay.url)}
                  disabled={preferSyncMutation.isPending}
                >
                  Make preferred
                </Button>
              )}
              <Button
                variant="link"
                size="xs"
                onClick={() =>
                  pauseSyncMutation.mutate({
                    url: relay.url,
                    paused: !relay.paused,
                  })
                }
                disabled={pauseSyncMutation.isPending}
              >
                {relay.paused ? "Resume" : "Pause"}
              </Button>
              <button
                type="button"
                onClick={() => removeSyncMutation.mutate(relay.url)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Remove relay"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editor.editing && (
        <RelayUrlForm
          value={editor.value}
          onChange={editor.setValue}
          onSubmit={() => addSyncMutation.mutate(editor.value.trim())}
          onCancel={() => {
            editor.close();
            addSyncMutation.reset();
          }}
          isPending={addSyncMutation.isPending}
          error={
            addSyncMutation.isError
              ? errorMessage(addSyncMutation.error, "Failed to add relay")
              : undefined
          }
          submitLabel="Add"
        />
      )}
      {!editor.editing && (
        <Button variant="link" size="xs" onClick={() => editor.open()}>
          Add sync relay
        </Button>
      )}
    </div>
  );
}

function BlossomSection({
  queryClient,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const editor = useInlineEditor();

  const { data: blossomUrl } = useQuery({
    queryKey: ["blossom-url"],
    queryFn: () => invoke<string | null>("get_blossom_url"),
  });

  const setMutation = useMutation({
    mutationFn: (url: string) => invoke("set_blossom_url", { url }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["blossom-url"] });
      editor.close();
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => invoke("remove_blossom_url"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["blossom-url"] });
    },
  });

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">Blob Storage</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        A Blossom server used to sync image attachments between devices.
      </p>

      {blossomUrl && !editor.editing && (
        <div className="flex items-center gap-2">
          <code className="bg-muted rounded px-2 py-1 text-sm">
            {blossomUrl}
          </code>
          <Button
            variant="link"
            size="xs"
            onClick={() => editor.open(blossomUrl)}
          >
            Change
          </Button>
          <Button
            variant="link"
            size="xs"
            className="text-destructive"
            onClick={() => removeMutation.mutate()}
          >
            Remove
          </Button>
        </div>
      )}
      {editor.editing && (
        <RelayUrlForm
          value={editor.value}
          onChange={editor.setValue}
          onSubmit={() => setMutation.mutate(editor.value.trim())}
          onCancel={() => {
            editor.close();
            setMutation.reset();
          }}
          isPending={setMutation.isPending}
          error={
            setMutation.isError
              ? errorMessage(setMutation.error, "Failed to set server")
              : undefined
          }
          submitLabel="Save"
          placeholder="https://..."
        />
      )}
      {!blossomUrl && !editor.editing && (
        <Button variant="link" size="xs" onClick={() => editor.open()}>
          Set Blossom server
        </Button>
      )}
    </div>
  );
}

function ResyncSection({
  queryClient,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const resyncMutation = useMutation({
    mutationFn: () => invoke("resync"),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">Resync</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        Delete all local data and re-download from the sync relay.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => resyncMutation.mutate()}
        disabled={resyncMutation.isPending}
      >
        <RefreshCw
          className={`mr-2 size-3.5 ${resyncMutation.isPending ? "animate-spin" : ""}`}
        />
        {resyncMutation.isPending ? "Resyncing..." : "Resync"}
      </Button>
    </div>
  );
}

function PublishRelaysSection({
  relays,
  queryClient,
}: {
  relays: Relay[];
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const editor = useInlineEditor();

  const addMutation = useMutation({
    mutationFn: (url: string) => invoke<Relay[]>("add_publish_relay", { url }),
    onSuccess: (data) => {
      queryClient.setQueryData(["relays"], data);
      editor.close();
    },
  });

  const removeMutation = useMutation({
    mutationFn: (url: string) =>
      invoke<Relay[]>("remove_relay", { url, kind: "publish" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["relays"], data);
    },
  });

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">Publish Relays</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        Notes are published to all relays in this list.
      </p>

      {relays.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {relays.map((relay) => (
            <li key={relay.url} className="flex items-center gap-2">
              <code className="bg-muted rounded px-2 py-1 text-sm">
                {relay.url}
              </code>
              <button
                type="button"
                onClick={() => removeMutation.mutate(relay.url)}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Remove relay"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editor.editing ? (
        <RelayUrlForm
          value={editor.value}
          onChange={editor.setValue}
          onSubmit={() => addMutation.mutate(editor.value.trim())}
          onCancel={() => {
            editor.close();
            addMutation.reset();
          }}
          isPending={addMutation.isPending}
          error={
            addMutation.isError
              ? errorMessage(addMutation.error, "Failed to add relay")
              : undefined
          }
          submitLabel="Add"
        />
      ) : (
        <Button variant="link" size="xs" onClick={() => editor.open()}>
          Add relay
        </Button>
      )}
    </div>
  );
}

function RelayUrlForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  isPending,
  error,
  submitLabel,
  placeholder = "wss://...",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | undefined;
  submitLabel: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <input
        autoCapitalize="off"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-muted w-full rounded border px-2 py-1 font-mono text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit();
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
      />
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="xs"
          onClick={onSubmit}
          disabled={!value.trim() || isPending}
        >
          {submitLabel}
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
