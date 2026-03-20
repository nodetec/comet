import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getStats,
  getEventsByKind,
  getEventsOverTime,
  getStorageByUser,
} from "~/server/admin/stats";
import { StatsCards } from "~/components/admin/stats-cards";
import {
  EventsOverTimeChart,
  EventsByKindChart,
  StorageByUserChart,
} from "~/components/admin/charts";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => getStats(),
    refetchInterval: 5000,
  });
  const { data: eventsByKind } = useQuery({
    queryKey: ["admin", "stats", "events-by-kind"],
    queryFn: () => getEventsByKind(),
  });
  const { data: eventsOverTime } = useQuery({
    queryKey: ["admin", "stats", "events-over-time"],
    queryFn: () => getEventsOverTime(),
  });
  const { data: storageByUser } = useQuery({
    queryKey: ["admin", "stats", "storage-by-user"],
    queryFn: () => getStorageByUser(),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Relay and storage overview
        </p>
      </div>
      <StatsCards stats={stats} />
      <div className="grid gap-6 lg:grid-cols-7">
        <EventsOverTimeChart data={eventsOverTime?.data} />
        <EventsByKindChart data={eventsByKind?.data} />
      </div>
      <StorageByUserChart data={storageByUser?.data} />
    </div>
  );
}
