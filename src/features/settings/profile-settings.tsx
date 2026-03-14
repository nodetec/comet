import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";

import type { BootstrapPayload } from "@/features/shell/types";

export function ProfileSettings() {
  const queryClient = useQueryClient();
  const bootstrap = queryClient.getQueryData<BootstrapPayload>(["bootstrap"]);
  const npub = bootstrap?.npub ?? "";

  const [editing, setEditing] = useState(false);
  const [nsecInput, setNsecInput] = useState("");
  const [copied, setCopied] = useState(false);

  const importMutation = useMutation({
    mutationFn: (nsec: string) => invoke<string>("import_nsec", { nsec }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setEditing(false);
      setNsecInput("");
    },
  });

  const handleCopy = async () => {
    await writeText(npub);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncated = npub.length > 20
    ? `${npub.slice(0, 12)}...${npub.slice(-8)}`
    : npub;

  return (
    <div>
      <h3 className="mb-4 text-sm font-medium">Nostr Identity</h3>

      <div className="space-y-4">
        <div>
          <label className="text-muted-foreground mb-1 block text-xs">
            Public Key
          </label>
          <div className="flex items-center gap-2">
            <code className="bg-muted rounded px-2 py-1 text-sm">
              {truncated}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Copy full npub"
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
        </div>

        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-blue-500 hover:underline"
          >
            Change Key
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-yellow-600 dark:text-yellow-500">
              This will permanently replace your current identity.
            </p>
            <input
              type="password"
              value={nsecInput}
              onChange={(e) => {
                setNsecInput(e.target.value);
                importMutation.reset();
              }}
              placeholder="nsec1..."
              className="bg-muted w-full rounded border px-2 py-1 font-mono text-sm"
            />
            {importMutation.isError && (
              <p className="text-xs text-red-500">
                {(importMutation.error as Error).message ?? "Import failed"}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => importMutation.mutate(nsecInput.trim())}
                disabled={!nsecInput.trim() || importMutation.isPending}
                className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {importMutation.isPending ? "Importing..." : "Import"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setNsecInput("");
                  importMutation.reset();
                }}
                className="text-muted-foreground rounded px-3 py-1 text-xs hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
