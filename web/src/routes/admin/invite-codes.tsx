import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Plus, Ticket, Copy, Check, Ban } from "lucide-react";
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
import { DataTable } from "~/components/admin/data-table";
import {
  listInviteCodes,
  createInviteCode,
  revokeInviteCode,
} from "~/server/admin/invite-codes";

export const Route = createFileRoute("/admin/invite-codes")({
  component: InviteCodesPage,
});

type InviteCode = {
  id: number;
  code: string;
  maxUses: number;
  useCount: number;
  expiresAt: number | null;
  revoked: boolean;
  createdAt: number;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

function codeStatus(code: InviteCode): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (code.revoked) return { label: "Revoked", variant: "destructive" };
  if (code.expiresAt && code.expiresAt < Math.floor(Date.now() / 1000))
    return { label: "Expired", variant: "secondary" };
  if (code.useCount >= code.maxUses)
    return { label: "Used", variant: "secondary" };
  return { label: "Active", variant: "default" };
}

function InviteCodesPage() {
  const queryClient = useQueryClient();
  const [maxUses, setMaxUses] = useState("1");
  const [newCode, setNewCode] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["admin", "invite-codes"],
    queryFn: () => listInviteCodes(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createInviteCode({ data: { maxUses: parseInt(maxUses, 10) || 1 } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "invite-codes"],
      });
      setNewCode(result.code);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => revokeInviteCode({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin", "invite-codes"],
      });
    },
  });

  const columns = useMemo<ColumnDef<InviteCode>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <code className="font-mono text-xs">{row.original.code}</code>
            <CopyButton text={row.original.code} />
          </div>
        ),
      },
      {
        accessorKey: "useCount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Uses <ArrowUpDown className="ml-1 h-3 w-3" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.useCount} / {row.original.maxUses}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => {
          const status = codeStatus(row.original);
          return <Badge variant={status.variant}>{status.label}</Badge>;
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {new Date(row.original.createdAt * 1000).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          if (row.original.revoked) return null;
          return (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Ban className="text-destructive h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke invite code?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This code will no longer be usable. Users who already
                    redeemed it will not be affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => revokeMutation.mutate(row.original.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Revoke
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        },
      },
    ],
    [revokeMutation],
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invite Codes</h1>
        <p className="text-muted-foreground text-sm">
          Create and manage invite codes for new users
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4" />
            Create Invite Code
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">Max uses:</span>
              <Input
                type="number"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                className="w-20"
              />
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              <Plus className="mr-1 h-4 w-4" />
              Create
            </Button>
          </div>
          {newCode && (
            <div className="border-primary/20 bg-primary/5 flex items-center gap-2 rounded-md border p-3">
              <code className="flex-1 font-mono text-sm font-semibold">
                {newCode}
              </code>
              <CopyButton text={newCode} />
            </div>
          )}
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={data?.inviteCodes ?? []}
        emptyMessage="No invite codes created yet."
      />
    </div>
  );
}
