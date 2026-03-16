import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/utils";

import { SettingRow } from "./setting-row";
import { useInlineEditor } from "./use-inline-editor";

type Relay = {
  url: string;
  kind: "sync" | "publish";
  createdAt: number;
};

export function RelaysSettings() {
  const queryClient = useQueryClient();

  const { data: relays = [] } = useQuery({
    queryKey: ["relays"],
    queryFn: () => invoke<Relay[]>("list_relays"),
  });

  const syncRelay = relays.find((r) => r.kind === "sync");
  const publishRelays = relays.filter((r) => r.kind === "publish");

  return (
    <div className="space-y-8">
      <SyncToggle />
      <SyncRelaySection relay={syncRelay} queryClient={queryClient} />
      <BlossomSection queryClient={queryClient} />
      <ResyncSection queryClient={queryClient} />
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
      queryClient.setQueryData(["sync-enabled"], newEnabled);
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

function SyncRelaySection({
  relay,
  queryClient,
}: {
  relay: Relay | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const editor = useInlineEditor();

  const setSyncMutation = useMutation({
    mutationFn: (url: string) => invoke<Relay[]>("set_sync_relay", { url }),
    onSuccess: (data) => {
      queryClient.setQueryData(["relays"], data);
      editor.close();
    },
  });

  const removeSyncMutation = useMutation({
    mutationFn: () => invoke<Relay[]>("remove_sync_relay"),
    onSuccess: (data) => {
      queryClient.setQueryData(["relays"], data);
    },
  });

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">Sync Relay</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        A single relay used to sync notes between your devices.
      </p>

      {relay && !editor.editing ? (
        <div className="flex items-center gap-2">
          <code className="bg-muted rounded px-2 py-1 text-sm">
            {relay.url}
          </code>
          <Button
            variant="link"
            size="xs"
            onClick={() => editor.open(relay.url)}
          >
            Change
          </Button>
          <Button
            variant="link"
            size="xs"
            className="text-destructive"
            onClick={() => removeSyncMutation.mutate()}
          >
            Remove
          </Button>
        </div>
      ) : !editor.editing ? (
        <Button variant="link" size="xs" onClick={() => editor.open()}>
          Set sync relay
        </Button>
      ) : (
        <RelayUrlForm
          value={editor.value}
          onChange={editor.setValue}
          onSubmit={() => setSyncMutation.mutate(editor.value.trim())}
          onCancel={() => {
            editor.close();
            setSyncMutation.reset();
          }}
          isPending={setSyncMutation.isPending}
          error={
            setSyncMutation.isError
              ? errorMessage(setSyncMutation.error, "Failed to set relay")
              : undefined
          }
          submitLabel="Save"
        />
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
      queryClient.invalidateQueries({ queryKey: ["blossom-url"] });
      editor.close();
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => invoke("remove_blossom_url"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blossom-url"] });
    },
  });

  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">Blob Storage</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        A Blossom server used to sync image attachments between devices.
      </p>

      {blossomUrl && !editor.editing ? (
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
      ) : !editor.editing ? (
        <Button variant="link" size="xs" onClick={() => editor.open()}>
          Set Blossom server
        </Button>
      ) : (
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
      queryClient.invalidateQueries();
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
                className="text-muted-foreground transition-colors hover:text-red-500"
                title="Remove relay"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!editor.editing ? (
        <Button variant="link" size="xs" onClick={() => editor.open()}>
          Add relay
        </Button>
      ) : (
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
      {error && <p className="text-xs text-red-500">{error}</p>}
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
