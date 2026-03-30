import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";

import {
  addAccount,
  getAccountNsec,
  getSecretStorageStatus,
  listAccounts,
  moveSecretToKeychain,
  switchAccount,
} from "@/shared/api/invoke";
import { Button } from "@/shared/ui/button";
import { errorMessage } from "@/shared/lib/utils";
import {
  prepareForAccountChange,
  preserveSettingsAcrossReload,
} from "@/features/settings/lib/account-change";

export function ProfileSettings() {
  const queryClient = useQueryClient();
  const [addingAccount, setAddingAccount] = useState(false);
  const [nsec, setNsec] = useState("");
  const [storeInKeychain, setStoreInKeychain] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedNsecPublicKey, setCopiedNsecPublicKey] = useState<string | null>(
    null,
  );
  const [accountChangePending, setAccountChangePending] = useState(false);
  const accountChangeLockRef = useRef(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
  });

  const { data: secretStorageStatus } = useQuery({
    queryKey: ["secret-storage-status"],
    queryFn: getSecretStorageStatus,
  });

  const activeAccount = accounts.find((account) => account.isActive) ?? null;
  const npub = activeAccount?.npub ?? "";

  const addAccountMutation = useMutation({
    mutationFn: async ({
      value,
      storeInKeychain,
    }: {
      value: string;
      storeInKeychain: boolean;
    }) => {
      await prepareForAccountChange();
      return addAccount({ nsec: value, storeInKeychain });
    },
    onSuccess: () => {
      preserveSettingsAcrossReload("profile");
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
      return switchAccount(publicKey);
    },
    onSuccess: () => {
      preserveSettingsAcrossReload("profile");
      window.location.reload();
    },
    onSettled: () => {
      accountChangeLockRef.current = false;
      setAccountChangePending(false);
    },
  });

  const copyNsecMutation = useMutation({
    mutationFn: async (publicKey: string) => {
      const nsec = await getAccountNsec(publicKey);
      await writeText(nsec);
      return publicKey;
    },
    onSuccess: (publicKey) => {
      setCopiedNsecPublicKey(publicKey);
      window.setTimeout(() => {
        setCopiedNsecPublicKey((currentPublicKey) =>
          currentPublicKey === publicKey ? null : currentPublicKey,
        );
      }, 2000);
    },
    onError: (error) => {
      toast.error(errorMessage(error, "Couldn't copy nsec"));
    },
  });

  const moveSecretToKeychainMutation = useMutation({
    mutationFn: moveSecretToKeychain,
    onSuccess: async () => {
      toast.success("Moved secret to OS keychain.");
      await queryClient.invalidateQueries({
        queryKey: ["secret-storage-status"],
      });
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
    addAccountMutation.mutate({ value: trimmed, storeInKeychain });
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

  const handleCopyNsec = (publicKey: string) => {
    if (copyNsecMutation.isPending) {
      return;
    }

    copyNsecMutation.mutate(publicKey);
  };

  const truncated =
    npub.length > 20 ? `${npub.slice(0, 12)}...${npub.slice(-8)}` : npub;

  const secretStorageLabel =
    secretStorageStatus?.storage === "keychain"
      ? "OS keychain"
      : "Account database";

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
        <h3 className="mb-4 text-sm font-medium">Security</h3>

        <div className="bg-muted/40 space-y-3 rounded-lg border px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Secret storage</div>
              <p className="text-muted-foreground text-xs">
                Current location: {secretStorageLabel}
              </p>
            </div>
            <Button
              size="xs"
              variant="outline"
              onClick={() => moveSecretToKeychainMutation.mutate()}
              disabled={
                moveSecretToKeychainMutation.isPending ||
                secretStorageStatus?.storage === "keychain"
              }
            >
              {moveSecretToKeychainMutation.isPending
                ? "Moving..."
                : "Move To OS Keychain"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Database storage avoids startup keychain prompts but is less secure
            at rest. OS keychain storage is recommended for stronger local
            protection.
          </p>
          {moveSecretToKeychainMutation.isError ? (
            <p className="text-xs text-red-500">
              {errorMessage(
                moveSecretToKeychainMutation.error,
                "Couldn't move secret to OS keychain",
              )}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Accounts</h3>
          {addingAccount ? null : (
            <Button
              variant="link"
              size="xs"
              onClick={() => setAddingAccount(true)}
              disabled={isAccountChangePending}
            >
              Add Account
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {accounts.map((account) => {
            const isSwitching =
              switchAccountMutation.isPending &&
              switchAccountMutation.variables === account.publicKey;
            const isCopyingNsec =
              copyNsecMutation.isPending &&
              copyNsecMutation.variables === account.publicKey;
            const hasCopiedNsec = copiedNsecPublicKey === account.publicKey;

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

                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => handleCopyNsec(account.publicKey)}
                    disabled={isAccountChangePending || isCopyingNsec}
                  >
                    {hasCopiedNsec ? "Copied" : "Copy nsec"}
                  </Button>
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
              autoCapitalize="off"
              type="password"
              value={nsec}
              onChange={(e) => {
                setNsec(e.target.value);
                addAccountMutation.reset();
              }}
              placeholder="nsec1..."
              className="bg-muted w-full rounded border px-2 py-1 font-mono text-sm"
            />
            <label className="flex items-start gap-2 text-xs">
              <input
                checked={storeInKeychain}
                className="mt-0.5"
                onChange={(event) =>
                  setStoreInKeychain(event.currentTarget.checked)
                }
                type="checkbox"
              />
              <span className="text-muted-foreground">
                Store this secret in the OS keychain instead of the account
                database.
              </span>
            </label>
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
                  setStoreInKeychain(false);
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
