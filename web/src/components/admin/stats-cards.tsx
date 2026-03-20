import { FileText, HardDrive, Database, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { formatBytes } from "~/lib/utils";

interface Stats {
  events: number;
  blobs: number;
  users: number;
  blobStorage: number;
}

interface StatsCardsProps {
  stats?: Stats;
}

const statCards = [
  { key: "events" as const, label: "Stored Events", icon: FileText },
  { key: "blobs" as const, label: "Blobs", icon: HardDrive },
  { key: "users" as const, label: "Users", icon: Users },
  { key: "blobStorage" as const, label: "Blob Storage", icon: Database },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat) => (
        <Card key={stat.key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
            <stat.icon className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stat.key === "blobStorage"
                ? formatBytes(stats?.blobStorage ?? 0)
                : (stats?.[stat.key] ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
