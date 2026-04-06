import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Plus, Trash2, KeyRound, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
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
import {
  listAccessKeys,
  createAccessKey,
  revokeAccessKey,
} from "~/server/admin/access-keys";
import { formatBytes, usagePercent, usageColor } from "~/lib/utils";

export const Route = createFileRoute("/admin/access-keys")({
  component: AccessKeysPage,
});

type AccessKeyRow = {
  key: string;
  label: string | null;
  expiresAt: number | null;
  storageLimitBytes: number | null;
  revoked: boolean;
  createdAt: number;
  storageUsedBytes: number;
};

function MaskedKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const masked =
    value.length > 10 ? `${value.slice(0, 7)}...${value.slice(-4)}` : value;

  return (
    <div className="flex items-center gap-1.5">
      <code className="text-xs">{masked}</code>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

function AccessKeysPage() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdKeyCopied, setCreatedKeyCopied] = useState(false);

  const { data } = useQuery({
    queryKey: ["admin", "access-keys"],
    queryFn: () => listAccessKeys(),
  });

  const defaultLimit = data?.defaultStorageLimitBytes ?? 1024 * 1024 * 1024;

  const createMutation = useMutation({
    mutationFn: (label: string) =>
      createAccessKey({ data: { label: label || null } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "access-keys"] });
      setLabel("");
      setCreatedKey(result.key);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (key: string) => revokeAccessKey({ data: { key } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "access-keys"] });
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate(label);
  }

  function handleCopyCreated() {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCreatedKeyCopied(true);
      setTimeout(() => setCreatedKeyCopied(false), 2000);
    }
  }

  const columns = useMemo<ColumnDef<AccessKeyRow>[]>(
    () => [
      {
        accessorKey: "key",
        header: "Key",
        cell: ({ row }) => <MaskedKey value={row.original.key} />,
      },
      {
        accessorKey: "label",
        header: "Label",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.label ?? (
              <span className="text-muted-foreground">-</span>
            )}
          </span>
        ),
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
        accessorKey: "revoked",
        header: "Status",
        cell: ({ row }) =>
          row.original.revoked ? (
            <Badge variant="destructive">Revoked</Badge>
          ) : (
            <Badge variant="default">Active</Badge>
          ),
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
        cell: ({ row }) =>
          row.original.revoked ? null : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Trash2 className="text-destructive h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke access key?</AlertDialogTitle>
                  <AlertDialogDescription>
                    All connections using this key will lose relay and storage
                    access.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => revokeMutation.mutate(row.original.key)}
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
        <h1 className="text-2xl font-semibold tracking-tight">Access Keys</h1>
        <p className="text-muted-foreground text-sm">
          Manage API keys for relay and storage access
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Create Access Key
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <Input
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="flex-1 text-sm"
            />
            <Button type="submit" disabled={createMutation.isPending}>
              <Plus className="mr-1 h-4 w-4" />
              Create
            </Button>
          </form>
          {createMutation.isError && (
            <p className="text-destructive mt-2 text-sm">
              Failed to create key
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={createdKey !== null}
        onOpenChange={(open) => {
          if (!open) setCreatedKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Access key created</DialogTitle>
            <DialogDescription>
              Copy this key now. It will not be shown again in full.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted rounded-md p-3">
            <code className="text-sm break-all">{createdKey}</code>
          </div>
          <DialogFooter>
            <Button onClick={handleCopyCreated}>
              {createdKeyCopied ? (
                <>
                  <Check className="mr-1 h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-4 w-4" /> Copy to clipboard
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DataTable
        columns={columns}
        data={data?.keys ?? []}
        emptyMessage="No access keys created yet."
      />
    </div>
  );
}
