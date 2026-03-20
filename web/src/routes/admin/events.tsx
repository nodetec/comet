import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, Trash2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { DataTable } from "~/components/admin/data-table";
import { listEvents, deleteEvents } from "~/server/admin/events";
import { formatTimestamp, kindLabel } from "~/lib/utils";

export const Route = createFileRoute("/admin/events")({
  component: EventsPage,
});

type EventEntry = {
  id: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  firstSeen: number;
  content: string;
};

function EventsPage() {
  const queryClient = useQueryClient();
  const [kindFilter, setKindFilter] = useState("");
  const [pubkeyFilter, setPubkeyFilter] = useState("");

  const params: { kind?: number; pubkey?: string } = {};
  if (kindFilter && !isNaN(Number(kindFilter)))
    params.kind = Number(kindFilter);
  if (pubkeyFilter && /^[a-f0-9]{64}$/.test(pubkeyFilter))
    params.pubkey = pubkeyFilter;

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["admin", "events", params],
      queryFn: ({ pageParam }) =>
        listEvents({ data: { ...params, cursor: pageParam } }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteEvents({ data: { ids } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin", "events"] }),
  });

  const allEvents = data?.pages.flatMap((p) => p.events) ?? [];

  const columns = useMemo<ColumnDef<EventEntry>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.id.slice(0, 16)}...
          </span>
        ),
      },
      {
        accessorKey: "kind",
        header: "Kind",
        cell: ({ row }) => (
          <Badge variant="secondary">{kindLabel(row.original.kind)}</Badge>
        ),
      },
      {
        accessorKey: "pubkey",
        header: "Pubkey",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.pubkey.slice(0, 12)}...
          </span>
        ),
      },
      {
        accessorKey: "content",
        header: "Content",
        cell: ({ row }) => (
          <span className="text-muted-foreground block max-w-[300px] truncate text-xs">
            {row.original.content || "—"}
          </span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Created <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground block text-right text-xs">
            {formatTimestamp(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-muted-foreground text-sm">
          Browse stored Nostr events
          {allEvents.length > 0 && (
            <span className="ml-1">
              ({allEvents.length}
              {hasNextPage ? "+" : ""})
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Filter by kind..."
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="sm:w-40"
        />
        <Input
          placeholder="Filter by pubkey (64-char hex)..."
          value={pubkeyFilter}
          onChange={(e) => setPubkeyFilter(e.target.value)}
          className="flex-1"
        />
      </div>

      <DataTable
        columns={columns}
        data={allEvents}
        getRowId={(row) => row.id}
        enableRowSelection
        emptyMessage="No events found."
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        actionBar={({ selectedRows, clearSelection }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Actions
                {selectedRows.length > 0 && (
                  <span className="text-muted-foreground ml-1">
                    ({selectedRows.length})
                  </span>
                )}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={selectedRows.length === 0 || deleteMutation.isPending}
                onClick={async () => {
                  await deleteMutation.mutateAsync(
                    selectedRows.map((r) => r.id),
                  );
                  clearSelection();
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete {selectedRows.length} event
                {selectedRows.length !== 1 ? "s" : ""}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />
    </div>
  );
}
