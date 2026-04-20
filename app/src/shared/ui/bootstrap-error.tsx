import { Button } from "@/shared/ui/button";

interface BootstrapErrorProps {
  error: string;
  onRetry: () => void;
}

export function BootstrapError({ error, onRetry }: BootstrapErrorProps) {
  return (
    <div className="text-foreground flex min-h-screen items-center justify-center">
      <div className="border-border bg-card flex max-w-lg min-w-96 flex-col gap-4 rounded-xl border px-5 py-5 shadow-sm">
        <div className="space-y-1">
          <p className="font-semibold">Couldn&apos;t load your notes</p>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
        <div>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      </div>
    </div>
  );
}
