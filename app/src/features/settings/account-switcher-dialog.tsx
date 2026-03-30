import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, LoaderCircle, UserRound } from "lucide-react";

import { listAccounts, switchAccount } from "@/shared/api/invoke";
import type { AccountSummary } from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import {
  DialogBackdrop,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "@/shared/ui/dialog";
import { cn, errorMessage } from "@/shared/lib/utils";
import { prepareForAccountChange } from "@/features/settings/lib/account-change";

function truncatedNpub(npub: string) {
  return npub.length > 24 ? `${npub.slice(0, 16)}...${npub.slice(-8)}` : npub;
}

function defaultSelectedIndex(accounts: AccountSummary[]) {
  const firstInactiveIndex = accounts.findIndex((account) => !account.isActive);
  if (firstInactiveIndex !== -1) {
    return firstInactiveIndex;
  }

  const activeIndex = accounts.findIndex((account) => account.isActive);
  return Math.max(activeIndex, 0);
}

export function AccountSwitcherDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const {
    data: accounts = [],
    error,
    isError,
    isLoading,
  } = useQuery({
    queryKey: ["accounts"],
    queryFn: listAccounts,
    enabled: open,
  });

  const {
    error: switchAccountError,
    isError: isSwitchAccountError,
    isPending: isSwitchAccountPending,
    mutate: mutateSwitchAccount,
    variables: switchingPublicKey,
  } = useMutation({
    mutationFn: async (publicKey: string) => {
      await prepareForAccountChange();
      return switchAccount(publicKey);
    },
    onSuccess: () => {
      window.location.reload();
    },
  });

  const selectedAccount = accounts[selectedIndex] ?? null;
  const hasSwitchTarget = accounts.some((account) => !account.isActive);
  const accountCount = accounts.length;

  const focusSelectedRow = useCallback((index: number) => {
    window.requestAnimationFrame(() => {
      rowRefs.current[index]?.focus();
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (accountCount === 0) {
      return;
    }

    const nextIndex = defaultSelectedIndex(accounts);
    setSelectedIndex(nextIndex);
    focusSelectedRow(nextIndex);
  }, [accountCount, accounts, focusSelectedRow, open]);

  const handleDialogKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (accountCount === 0) {
        return;
      }

      switch (event.key) {
        case "ArrowDown": {
          event.preventDefault();
          const nextIndex = (selectedIndex + 1) % accountCount;
          setSelectedIndex(nextIndex);
          focusSelectedRow(nextIndex);
          break;
        }
        case "ArrowUp": {
          event.preventDefault();
          const nextIndex = (selectedIndex - 1 + accountCount) % accountCount;
          setSelectedIndex(nextIndex);
          focusSelectedRow(nextIndex);
          break;
        }
        case "Enter": {
          if (
            selectedAccount &&
            !selectedAccount.isActive &&
            !isSwitchAccountPending
          ) {
            event.preventDefault();
            mutateSwitchAccount(selectedAccount.publicKey);
          }
          break;
        }
        default: {
          break;
        }
      }
    },
    [
      accountCount,
      focusSelectedRow,
      isSwitchAccountPending,
      mutateSwitchAccount,
      selectedAccount,
      selectedIndex,
    ],
  );

  const content = useMemo(() => {
    if (isLoading) {
      return (
        <div className="text-muted-foreground py-8 text-center text-sm">
          Loading accounts…
        </div>
      );
    }

    if (isError) {
      return (
        <div className="space-y-3">
          <p className="text-destructive text-sm">
            {errorMessage(error, "Couldn't load accounts.")}
          </p>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      );
    }

    if (accounts.length === 0) {
      return (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">No accounts found.</p>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="space-y-2">
          {accounts.map((account, index) => {
            const isSelected = selectedIndex === index;
            const isActive = account.isActive;
            const isSwitching =
              isSwitchAccountPending &&
              switchingPublicKey === account.publicKey;
            let status: string | null = null;
            if (isActive) {
              status = "Current";
            } else if (isSelected) {
              status = "Press Enter";
            }

            return (
              <button
                key={account.publicKey}
                ref={(element) => {
                  rowRefs.current[index] = element;
                }}
                aria-pressed={isSelected}
                className={cn(
                  "border-border hover:bg-muted/70 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
                  isSelected && "bg-muted",
                )}
                onClick={() => {
                  setSelectedIndex(index);
                  if (!isActive && !isSwitchAccountPending) {
                    mutateSwitchAccount(account.publicKey);
                  }
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                tabIndex={isSelected ? 0 : -1}
                type="button"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <UserRound className="text-muted-foreground size-4 shrink-0" />
                    <span className="truncate text-sm font-medium">
                      {truncatedNpub(account.npub)}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isSwitching ? (
                    <LoaderCircle className="text-muted-foreground size-4 animate-spin" />
                  ) : null}
                  {status ? (
                    <span className="text-muted-foreground text-xs">
                      {status}
                    </span>
                  ) : null}
                  {isActive ? <Check className="text-primary size-4" /> : null}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            Use ↑ and ↓ to choose an account, then press Enter to switch.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>

        {hasSwitchTarget ? null : (
          <p className="text-muted-foreground mt-3 text-xs">
            Add another account in Settings to switch between identities.
          </p>
        )}

        {isSwitchAccountError ? (
          <p className="text-destructive mt-3 text-xs">
            {errorMessage(switchAccountError, "Couldn't switch accounts.")}
          </p>
        ) : null}
      </>
    );
  }, [
    accounts,
    error,
    hasSwitchTarget,
    isError,
    isLoading,
    isSwitchAccountError,
    isSwitchAccountPending,
    mutateSwitchAccount,
    onOpenChange,
    selectedIndex,
    switchAccountError,
    switchingPublicKey,
  ]);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange} modal>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup
          className="w-full max-w-md p-5"
          onKeyDown={handleDialogKeyDown}
        >
          <DialogTitle className="text-base font-semibold">
            Switch Account
          </DialogTitle>
          <DialogDescription className="mt-1">
            Jump to another account without opening Settings.
          </DialogDescription>
          <div className="mt-4">{content}</div>
        </DialogPopup>
      </DialogPortal>
    </DialogRoot>
  );
}
