import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/utils";

type AccountSummary = {
  publicKey: string;
  npub: string;
  isActive: boolean;
};

type AccountChangePreparedDetail = {
  ok: boolean;
  message?: string;
};

async function prepareForAccountChange(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener(
        "comet:account-change-prepared",
        handlePrepared as EventListener,
      );
      reject(new Error("Timed out while saving the current draft."));
    }, 5000);

    const handlePrepared = (event: Event) => {
      const customEvent = event as CustomEvent<AccountChangePreparedDetail>;
      window.clearTimeout(timeoutId);
      window.removeEventListener(
        "comet:account-change-prepared",
        handlePrepared as EventListener,
      );

      if (customEvent.detail?.ok) {
        resolve();
        return;
      }

      reject(
        new Error(
          customEvent.detail?.message ?? "Couldn't save the current draft.",
        ),
      );
    };

    window.addEventListener(
      "comet:account-change-prepared",
      handlePrepared as EventListener,
      { once: true },
    );
    window.dispatchEvent(new CustomEvent("comet:prepare-account-change"));
  });
}

export function ProfileSettings() {
  const [addingAccount, setAddingAccount] = useState(false);
  const [nsec, setNsec] = useState("");
  const [copied, setCopied] = useState(false);
  const [accountChangePending, setAccountChangePending] = useState(false);
  const accountChangeLockRef = useRef(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => invoke<AccountSummary[]>("list_accounts"),
  });

  const activeAccount = accounts.find((account) => account.isActive) ?? null;
  const npub = activeAccount?.npub ?? "";

  const addAccountMutation = useMutation({
    mutationFn: async (value: string) => {
      await prepareForAccountChange();
      return invoke<AccountSummary>("add_account", { nsec: value });
    },
    onSuccess: () => {
      window.location.reload();
    },
    onSettled: () => {
      accountChangeLockRef.current = false;
      setAccountChangePending(false);
    },
  });

  const switchAccountMutation = useMutation({
    mutationFn: async (publicKey: string) => {
      await prepareForAccountChange();
      return invoke<AccountSummary>("switch_account", { publicKey });
    },
    onSuccess: () => {
      window.location.reload();
    },
    onSettled: () => {
      accountChangeLockRef.current = false;
      setAccountChangePending(false);
    },
  });

  const isAccountChangePending =
    accountChangePending ||
    addAccountMutation.isPending ||
    switchAccountMutation.isPending;

  const beginAccountChange = () => {
    if (accountChangeLockRef.current) {
      return false;
    }
    accountChangeLockRef.current = true;
    setAccountChangePending(true);
    return true;
  };

  const handleAddAccount = () => {
    const trimmed = nsec.trim();
    if (!trimmed || !beginAccountChange()) {
      return;
    }
    addAccountMutation.mutate(trimmed);
  };

  const handleSwitchAccount = (publicKey: string) => {
    if (!beginAccountChange()) {
      return;
    }
    switchAccountMutation.mutate(publicKey);
  };

  const handleCopy = async () => {
    if (!npub) {
      return;
    }
    await writeText(npub);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncated =
    npub.length > 20 ? `${npub.slice(0, 12)}...${npub.slice(-8)}` : npub;

  if (isLoading) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="mb-4 text-sm font-medium">Active Account</h3>

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
              disabled={!npub}
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
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Accounts</h3>
          {!addingAccount ? (
            <Button
              variant="link"
              size="xs"
              onClick={() => setAddingAccount(true)}
              disabled={isAccountChangePending}
            >
              Add Account
            </Button>
          ) : null}
        </div>

        <div className="space-y-3">
          {accounts.map((account) => {
            const isSwitching =
              switchAccountMutation.isPending &&
              switchAccountMutation.variables === account.publicKey;

            return (
              <div
                key={account.publicKey}
                className="bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm">
                      {account.npub.length > 20
                        ? `${account.npub.slice(0, 12)}...${account.npub.slice(-8)}`
                        : account.npub}
                    </code>
                    {account.isActive ? (
                      <span className="text-muted-foreground text-xs">
                        Active
                      </span>
                    ) : null}
                  </div>
                </div>

                {account.isActive ? (
                  <Button size="xs" variant="ghost" disabled>
                    Current
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => handleSwitchAccount(account.publicKey)}
                    disabled={isAccountChangePending}
                  >
                    {isSwitching ? "Switching..." : "Switch"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {switchAccountMutation.isError ? (
          <p className="mt-3 text-xs text-red-500">
            {errorMessage(switchAccountMutation.error, "Switch failed")}
          </p>
        ) : null}

        {addingAccount ? (
          <div className="mt-4 space-y-3">
            <p className="text-muted-foreground text-xs">
              Adding an account creates a separate workspace for that Nostr
              identity.
            </p>
            <input
              type="password"
              value={nsec}
              onChange={(e) => {
                setNsec(e.target.value);
                addAccountMutation.reset();
              }}
              placeholder="nsec1..."
              className="bg-muted w-full rounded border px-2 py-1 font-mono text-sm"
            />
            {addAccountMutation.isError ? (
              <p className="text-xs text-red-500">
                {errorMessage(addAccountMutation.error, "Add account failed")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                size="xs"
                onClick={handleAddAccount}
                disabled={!nsec.trim() || isAccountChangePending}
              >
                {addAccountMutation.isPending ? "Adding..." : "Add Account"}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setAddingAccount(false);
                  setNsec("");
                  addAccountMutation.reset();
                }}
                disabled={isAccountChangePending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
