import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/utils";
import type { BootstrapPayload } from "@/features/shell/types";

import { useInlineEditor } from "./use-inline-editor";

export function ProfileSettings() {
  const queryClient = useQueryClient();
  const bootstrap = queryClient.getQueryData<BootstrapPayload>(["bootstrap"]);
  const npub = bootstrap?.npub ?? "";

  const editor = useInlineEditor();
  const [copied, setCopied] = useState(false);

  const importMutation = useMutation({
    mutationFn: (nsec: string) => invoke<string>("import_nsec", { nsec }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      editor.close();
    },
  });

  const handleCopy = async () => {
    await writeText(npub);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncated =
    npub.length > 20 ? `${npub.slice(0, 12)}...${npub.slice(-8)}` : npub;

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

        {!editor.editing ? (
          <Button variant="link" size="xs" onClick={() => editor.open()}>
            Change Key
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-yellow-600 dark:text-yellow-500">
              This will permanently replace your current identity.
            </p>
            <input
              type="password"
              value={editor.value}
              onChange={(e) => {
                editor.setValue(e.target.value);
                importMutation.reset();
              }}
              placeholder="nsec1..."
              className="bg-muted w-full rounded border px-2 py-1 font-mono text-sm"
            />
            {importMutation.isError && (
              <p className="text-xs text-red-500">
                {errorMessage(importMutation.error, "Import failed")}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="xs"
                onClick={() => importMutation.mutate(editor.value.trim())}
                disabled={!editor.value.trim() || importMutation.isPending}
              >
                {importMutation.isPending ? "Importing..." : "Import"}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  editor.close();
                  importMutation.reset();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
