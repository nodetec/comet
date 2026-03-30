import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { DataTable } from "~/components/admin/data-table";
import { listEvents } from "~/server/admin/events";
import { formatTimestamp, kindLabel } from "~/lib/utils";

export const Route = createFileRoute("/admin/events")({
  component: EventsPage,
});

type EventEntry = {
  id: string;
  pubkey: string;
  kind: number;
  createdAt: number;
  content: string;
  source: "relay" | "revision";
};

function EventsPage() {
  const [kindFilter, setKindFilter] = useState("");
  const [pubkeyFilter, setPubkeyFilter] = useState("");

  const params: { kind?: number; pubkey?: string } = {};
  if (kindFilter && !Number.isNaN(Number(kindFilter))) {
    params.kind = Number(kindFilter);
  }
  if (pubkeyFilter && /^[a-f0-9]{64}$/.test(pubkeyFilter)) {
    params.pubkey = pubkeyFilter;
  }

  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["admin", "events", params],
      queryFn: ({ pageParam }) =>
        listEvents({ data: { ...params, cursor: pageParam } }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const allEvents = data?.pages.flatMap((page) => page.events) ?? [];

  const columns = useMemo<ColumnDef<EventEntry>[]>(
    () => [
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
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{kindLabel(row.original.kind)}</Badge>
            <Badge
              variant={
                row.original.source === "revision" ? "outline" : "secondary"
              }
            >
              {row.original.source === "revision" ? "Revision" : "Relay"}
            </Badge>
          </div>
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
          Browse stored relay and revision events
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
        getRowId={(row) => `${row.source}:${row.id}`}
        emptyMessage="No relay or revision events found."
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
      />
    </div>
  );
}
