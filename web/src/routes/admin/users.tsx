import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Users } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { DataTable } from "~/components/admin/data-table";
import { listUsers } from "~/server/admin/users";
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

function UsersPage() {
  const { data } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => listUsers(),
    refetchInterval: 10000,
  });

  const defaultLimit = data?.defaultStorageLimitBytes ?? 1024 * 1024 * 1024;

  const columns = useMemo<ColumnDef<UserEntry>[]>(
    () => [
      {
        accessorKey: "pubkey",
        header: "Pubkey",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.pubkey.slice(0, 16)}...
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
    ],
    [defaultLimit],
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
