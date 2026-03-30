import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PubkeyValue } from "~/components/admin/pubkey-value";
import { Button } from "~/components/ui/button";
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
import { DataTable } from "~/components/admin/data-table";
import { listBlobs, deleteBlob } from "~/server/admin/blobs";
import { formatBytes } from "~/lib/utils";

export const Route = createFileRoute("/admin/blobs")({
  component: BlobsPage,
});

type BlobEntry = {
  sha256: string;
  size: number;
  type: string | null;
  uploadedAt: number;
  owners: string[];
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return "Blob deletion failed";
}

function BlobsPage() {
  const queryClient = useQueryClient();
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["admin", "blobs"],
      queryFn: ({ pageParam }) => listBlobs({ data: { cursor: pageParam } }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const allBlobs = data?.pages.flatMap((p) => p.blobs) ?? [];

  const deleteMutation = useMutation({
    mutationFn: (sha256: string) => deleteBlob({ data: { sha256 } }),
    onSuccess: async (_, sha256) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "blobs"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "stats"] }),
      ]);
      toast.success(`Deleted blob ${sha256.slice(0, 12)}...`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });

  const columns = useMemo<ColumnDef<BlobEntry>[]>(
    () => [
      {
        accessorKey: "sha256",
        header: "SHA-256",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.sha256.slice(0, 16)}...
          </span>
        ),
      },
      {
        accessorKey: "owners",
        header: "Owner",
        cell: ({ row }) => {
          const owners = row.original.owners;
          if (owners.length === 0) {
            return <span className="text-muted-foreground text-xs">—</span>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {owners.map((pk) => (
                <PubkeyValue key={pk} pubkey={pk} variant="badge" />
              ))}
            </div>
          );
        },
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) =>
          row.original.type ? (
            <Badge variant="outline">{row.original.type}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "size",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Size <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm">{formatBytes(row.original.size)}</span>
        ),
      },
      {
        accessorKey: "uploadedAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Uploaded <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {new Date(row.original.uploadedAt * 1000).toLocaleString()}
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
                <AlertDialogTitle>Delete blob?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the blob from storage and the
                  database. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate(row.original.sha256)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ),
      },
    ],
    [deleteMutation],
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Blob Storage</h1>
        <p className="text-muted-foreground text-sm">
          Manage uploaded blobs
          {allBlobs.length > 0 && (
            <span className="ml-1">
              ({allBlobs.length}
              {hasNextPage ? "+" : ""})
            </span>
          )}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={allBlobs}
        emptyMessage="No blobs stored."
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
      />
    </div>
  );
}
