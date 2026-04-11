import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  HardDrive,
  Database,
  GitBranch,
  Copy,
  Check,
  KeyRound,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  getUserStats,
  getUserEventsOverTime,
  getUserEventsByKind,
} from "~/server/user/stats";
import { getUserAccessKey } from "~/server/user/access-key";
import { formatBytes } from "~/lib/utils";
import {
  EventsOverTimeChart,
  EventsByKindChart,
} from "~/components/admin/charts";

export function UserDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["user", "stats"],
    queryFn: () => getUserStats(),
    refetchInterval: 10_000,
  });

  const { data: eventsOverTime } = useQuery({
    queryKey: ["user", "stats", "events-over-time"],
    queryFn: () => getUserEventsOverTime(),
  });

  const { data: eventsByKind } = useQuery({
    queryKey: ["user", "stats", "events-by-kind"],
    queryFn: () => getUserEventsByKind(),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Your relay and storage overview
        </p>
      </div>

      <AccessKeyCard />

      <UserStatsCards stats={stats} />

      <div className="grid gap-6 lg:grid-cols-7">
        <EventsOverTimeChart data={eventsOverTime?.data} />
        <EventsByKindChart data={eventsByKind?.data} />
      </div>
    </div>
  );
}

function UserStatsCards({
  stats,
}: {
  stats?: { events: number; blobs: number; storage: number; snapshots: number };
}) {
  const cards = [
    { key: "events" as const, label: "Events", icon: FileText },
    { key: "blobs" as const, label: "Blobs", icon: HardDrive },
    { key: "storage" as const, label: "Storage Used", icon: Database },
    { key: "snapshots" as const, label: "Snapshots", icon: GitBranch },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
            <card.icon className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {card.key === "storage"
                ? formatBytes(stats?.storage ?? 0)
                : (stats?.[card.key] ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AccessKeyCard() {
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({
    queryKey: ["user", "access-key"],
    queryFn: () => getUserAccessKey(),
  });

  function handleCopy(key: string) {
    void navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4" />
          Access Key
        </CardTitle>
        {data?.accessKey && (
          <Badge variant={data.accessKey.revoked ? "destructive" : "default"}>
            {data.accessKey.revoked ? "Revoked" : "Active"}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {data?.accessKey ? (
          <>
            <div className="flex items-center gap-2">
              <code className="bg-muted rounded px-2 py-1 text-sm break-all">
                {data.accessKey.key}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => handleCopy(data.accessKey.key)}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            {data.linkedPubkeys.length > 0 && (
              <div className="mt-4">
                <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
                  <Users className="h-3 w-3" />
                  Linked Accounts ({data.linkedPubkeys.length})
                </div>
                <ul className="space-y-1">
                  {data.linkedPubkeys.map((lp) => (
                    <li
                      key={lp.pubkey}
                      className="flex items-center justify-between gap-2"
                    >
                      <code className="text-muted-foreground text-xs">
                        {lp.pubkey.slice(0, 12)}...{lp.pubkey.slice(-8)}
                      </code>
                      <span className="text-muted-foreground text-xs">
                        {new Date(lp.lastSeen * 1000).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            No access key assigned. Contact an administrator.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
