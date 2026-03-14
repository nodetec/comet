import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";

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
      <SyncRelaySection
        relay={syncRelay}
        queryClient={queryClient}
      />
      <PublishRelaysSection
        relays={publishRelays}
        queryClient={queryClient}
      />
    </div>
  );
}

function SyncRelaySection({
  relay,
  queryClient,
}: {
  relay: Relay | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [editing, setEditing] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const setSyncMutation = useMutation({
    mutationFn: (url: string) => invoke<Relay[]>("set_sync_relay", { url }),
    onSuccess: (data) => {
      queryClient.setQueryData(["relays"], data);
      setEditing(false);
      setUrlInput("");
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

      {relay && !editing ? (
        <div className="flex items-center gap-2">
          <code className="bg-muted rounded px-2 py-1 text-sm">
            {relay.url}
          </code>
          <button
            type="button"
            onClick={() => {
              setUrlInput(relay.url);
              setEditing(true);
            }}
            className="text-xs text-blue-500 hover:underline"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => removeSyncMutation.mutate()}
            className="text-xs text-red-500 hover:underline"
          >
            Remove
          </button>
        </div>
      ) : !editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm text-blue-500 hover:underline"
        >
          Set sync relay
        </button>
      ) : (
        <RelayUrlForm
          value={urlInput}
          onChange={setUrlInput}
          onSubmit={() => setSyncMutation.mutate(urlInput.trim())}
          onCancel={() => {
            setEditing(false);
            setUrlInput("");
            setSyncMutation.reset();
          }}
          isPending={setSyncMutation.isPending}
          error={setSyncMutation.isError ? (setSyncMutation.error as Error).message : undefined}
          submitLabel="Save"
        />
      )}
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
  const [adding, setAdding] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const addMutation = useMutation({
    mutationFn: (url: string) => invoke<Relay[]>("add_publish_relay", { url }),
    onSuccess: (data) => {
      queryClient.setQueryData(["relays"], data);
      setAdding(false);
      setUrlInput("");
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
                className="text-muted-foreground hover:text-red-500 transition-colors"
                title="Remove relay"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-sm text-blue-500 hover:underline"
        >
          Add relay
        </button>
      ) : (
        <RelayUrlForm
          value={urlInput}
          onChange={setUrlInput}
          onSubmit={() => addMutation.mutate(urlInput.trim())}
          onCancel={() => {
            setAdding(false);
            setUrlInput("");
            addMutation.reset();
          }}
          isPending={addMutation.isPending}
          error={addMutation.isError ? (addMutation.error as Error).message : undefined}
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
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | undefined;
  submitLabel: string;
}) {
  return (
    <div className="space-y-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="wss://..."
        className="bg-muted w-full rounded border px-2 py-1 font-mono text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit();
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim() || isPending}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted-foreground rounded px-3 py-1 text-xs hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
