import { Settings } from "~/features/settings";
import { useActiveUser } from "~/hooks/useActiveUser";
import { shortNpub } from "~/lib/nostr/shortNpub";

export function User() {
  const activeUser = useActiveUser();

  return (
    <Settings>
      <button className="flex items-center gap-3 p-4 text-accent-foreground/70 focus-visible:outline-none data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
        <div className="grid flex-1 text-left text-sm leading-tight">
          {activeUser.data ? (
            <>
              {/* <Avatar className="h-7 w-7 rounded-full">
                  <AvatarImage
                    src={"https://github.com/shadcn.png"}
                    alt={"img"}
                  />
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
                </Avatar> */}
              {activeUser.data?.Name ? (
                <>
                  <span className="truncate font-semibold">
                    {activeUser.data?.Name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {shortNpub(activeUser.data?.Npub)}
                  </span>
                </>
              ) : (
                <span className="truncate font-semibold">
                  {shortNpub(activeUser.data?.Npub)}
                </span>
              )}
            </>
          ) : (
            <span className="truncate font-semibold">Login &rarr;</span>
          )}
        </div>
      </button>
    </Settings>
  );
}
