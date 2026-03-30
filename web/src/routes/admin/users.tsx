import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { PubkeyValue } from "~/components/admin/pubkey-value";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
import { DataTable } from "~/components/admin/data-table";
import { deleteUserData, listUsers } from "~/server/admin/users";
import { shortNpub } from "~/lib/pubkeys";
import { formatBytes, usagePercent, usageColor } from "~/lib/utils";

export const Route = createFileRoute("/admin/users")({
  component: UsersPage,
});

type UserEntry = {
  pubkey: string;
  storageUsedBytes: number;
  storageLimitBytes: number | null;
  blobCount: number;
  eventCount: number;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return "User data deletion failed";
}

function UsersPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listUsers(),
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: (pubkey: string) => deleteUserData({ data: { pubkey } }),
    onSuccess: async (result, pubkey) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "blobs"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "events"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "stats"] }),
      ]);
      toast.success(
        `Deleted data for ${shortNpub(pubkey)} (${result.deletedRelayEvents + result.deletedRevisionEvents + result.deletedLegacyEvents} events, ${result.deletedBlobs} blobs, ${result.releasedSharedBlobs} shared releases)`,
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const defaultLimit = data?.defaultStorageLimitBytes ?? 1024 * 1024 * 1024;

  const columns = useMemo<ColumnDef<UserEntry>[]>(
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
          const user = row.original;
          const limit = user.storageLimitBytes ?? defaultLimit;
          const pct = usagePercent(user.storageUsedBytes, limit);
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs">
                <span>
                  {formatBytes(user.storageUsedBytes)} / {formatBytes(limit)}
                </span>
                {user.storageLimitBytes !== null && (
                  <Badge variant="outline" className="px-1 py-0 text-[10px]">
                    custom
                  </Badge>
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
        accessorKey: "blobCount",
        header: "Blobs",
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.original.blobCount.toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: "eventCount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Events <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="block text-right tabular-nums">
            {row.original.eventCount.toLocaleString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="text-destructive h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all user data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all stored events for this user and remove
                  all blob ownership. Shared blobs owned by other users will be
                  kept. Current counts:{" "}
                  {row.original.eventCount.toLocaleString()} events,{" "}
                  {row.original.blobCount.toLocaleString()} blobs.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate(row.original.pubkey)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete Data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ),
      },
    ],
    [defaultLimit, deleteMutation],
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">
          <Users className="mr-1 inline h-4 w-4" />
          Per-user storage and event usage
          {data && <span className="ml-1">({data.users.length})</span>}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data?.users ?? []}
        emptyMessage="No users found."
      />
    </div>
  );
}
