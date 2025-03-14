import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { shortNpub } from "~/lib/nostr";
import { useAppState } from "~/store";

import { LoginDialog } from "./LoginDialog";

export function ProfileSettings() {
  const keys = useAppState((state) => state.keys);
  const setKeys = useAppState((state) => state.setKeys);

  const handleLogout = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setKeys(undefined);
  };

  return (
    <div className="flex flex-col space-y-4">
      <ScrollArea type="scroll">
        <h1 className="border-muted text-primary mx-12 border-b py-4 text-lg font-bold">
          Profile
        </h1>

        <div className="mx-12 my-4 h-full py-4">
          <div className="border-accent flex gap-4 items-center justify-between border-b pb-4">
            <div className="flex flex-col">
              <h3 className="text-lg font-semibold">Account</h3>
              <p className="text-muted-foreground text-sm">
                {keys?.npub
                  ? `You are currently logged in as ${shortNpub(keys.npub)}`
                  : "You are not currently logged in"}
              </p>
            </div>
            <div className="flex items-center space-x-2 ">
              {keys?.npub ? (
                <Button variant="default" onClick={handleLogout}>
                  Logout
                </Button>
              ) : (
                <LoginDialog>
                  <Button variant="default">Login</Button>
                </LoginDialog>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
