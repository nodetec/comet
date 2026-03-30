import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Plus, Trash2, Shield, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { DataTable } from "~/components/admin/data-table";
import { PubkeyValue } from "~/components/admin/pubkey-value";
import {
  listAllowedUsers,
  allowUser,
  revokeUser,
  setStorageLimit,
} from "~/server/admin/allowlist";
import { resolvePubkeyInput } from "~/lib/pubkeys";
import { formatBytes, usagePercent, usageColor } from "~/lib/utils";

export const Route = createFileRoute("/admin/allowlist")({
  component: AllowlistPage,
});

type AllowedPubkey = {
  pubkey: string;
  expiresAt: number | null;
  storageLimitBytes: number | null;
  createdAt: number;
  storageUsedBytes: number;
};

function StorageLimitEditor({
  pubkey,
  currentLimit,
  defaultLimit,
}: {
  pubkey: AllowedPubkey;
  currentLimit: number;
  defaultLimit: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [limitGB, setLimitGB] = useState(
    String(currentLimit / (1024 * 1024 * 1024)),
  );

  const mutation = useMutation({
    mutationFn: (storageLimitBytes: number | null) =>
      setStorageLimit({ data: { pubkey: pubkey.pubkey, storageLimitBytes } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "allowlist"] });
      setOpen(false);
    },
  });

  function handleSave() {
    const gb = parseFloat(limitGB);
    if (isNaN(gb) || gb <= 0) return;
    mutation.mutate(Math.round(gb * 1024 * 1024 * 1024));
  }

  function handleReset() {
    mutation.mutate(null);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => {
          setLimitGB(String(currentLimit / (1024 * 1024 * 1024)));
          setOpen(true);
        }}
      >
        <Pencil className="h-3 w-3" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Storage Limit</DialogTitle>
            <DialogDescription>
              Set a custom storage limit for:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <PubkeyValue pubkey={pubkey.pubkey} />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={limitGB}
                onChange={(e) => setLimitGB(e.target.value)}
                className="w-32"
              />
              <span className="text-muted-foreground text-sm">GB</span>
            </div>
            <p className="text-muted-foreground text-xs">
              Default: {formatBytes(defaultLimit)}. Current usage:{" "}
              {formatBytes(pubkey.storageUsedBytes)}.
            </p>
          </div>
          <DialogFooter className="flex gap-2">
            {pubkey.storageLimitBytes !== null && (
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={mutation.isPending}
              >
                Reset to default
              </Button>
            )}
            <Button onClick={handleSave} disabled={mutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AllowlistPage() {
  const queryClient = useQueryClient();
  const [newPubkey, setNewPubkey] = useState("");

  const { data } = useQuery({
    queryKey: ["admin", "allowlist"],
    queryFn: () => listAllowedUsers(),
  });

  const defaultLimit = data?.defaultStorageLimitBytes ?? 1024 * 1024 * 1024;

  const addMutation = useMutation({
    mutationFn: (pubkey: string) => allowUser({ data: { pubkey } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "allowlist"] });
      setNewPubkey("");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (pubkey: string) => revokeUser({ data: { pubkey } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "allowlist"] });
    },
  });

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const hex = resolvePubkeyInput(newPubkey);
    if (hex) {
      addMutation.mutate(hex);
    }
  }

  const columns = useMemo<ColumnDef<AllowedPubkey>[]>(
    () => [
      {
        accessorKey: "pubkey",
        header: "Identity",
        cell: ({ row }) => <PubkeyValue pubkey={row.original.pubkey} />,
      },
      {
        accessorKey: "storageUsedBytes",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Storage <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => {
          const p = row.original;
          const limit = p.storageLimitBytes ?? defaultLimit;
          const pct = usagePercent(p.storageUsedBytes, limit);
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs">
                <span>
                  {formatBytes(p.storageUsedBytes)} / {formatBytes(limit)}
                </span>
                {p.storageLimitBytes !== null && (
                  <span className="text-muted-foreground">(custom)</span>
                )}
                <StorageLimitEditor
                  pubkey={p}
                  currentLimit={limit}
                  defaultLimit={defaultLimit}
                />
              </div>
              <div className="bg-muted h-1.5 w-full max-w-[200px] rounded-full">
                <div
                  className={`h-full rounded-full transition-all ${usageColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "expiresAt",
        header: "Expires",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.expiresAt
              ? new Date(row.original.expiresAt * 1000).toLocaleString()
              : "Never"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <Trash2 className="text-destructive h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke access?</AlertDialogTitle>
                <AlertDialogDescription>
                  This pubkey will no longer be able to use the relay.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => revokeMutation.mutate(row.original.pubkey)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Revoke
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ),
      },
    ],
    [defaultLimit, revokeMutation],
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Allowlist</h1>
        <p className="text-muted-foreground text-sm">
          Manage pubkeys allowed to use the relay
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Add Pubkey
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleAdd}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <Input
              placeholder="npub or hex pubkey"
              value={newPubkey}
              onChange={(e) => setNewPubkey(e.target.value)}
              className="flex-1 font-mono text-sm"
            />
            <Button
              type="submit"
              disabled={!resolvePubkeyInput(newPubkey) || addMutation.isPending}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </form>
          {addMutation.isError && (
            <p className="text-destructive mt-2 text-sm">
              Failed to add pubkey
            </p>
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={data?.pubkeys ?? []}
        emptyMessage="No pubkeys on the allowlist."
      />
    </div>
  );
}
