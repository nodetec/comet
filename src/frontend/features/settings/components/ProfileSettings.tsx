import { useQueryClient } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useActiveUser } from "~/hooks/useActiveUser";
import { shortNpub } from "~/lib/nostr/shortNpub";

import { LoginDialog } from "./LoginDialog";

export function ProfileSettings() {
  const activeUser = useActiveUser();
  const queryClient = useQueryClient();

  const handleLogout = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!activeUser.data) return;
    try {
      await AppService.DeleteUser(activeUser.data?.ID);
      await queryClient.invalidateQueries({ queryKey: ["activeUser"] });
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <ScrollArea type="scroll">
        <h1 className="mx-12 border-b border-muted py-4 text-lg font-bold text-primary">
          Profile
        </h1>

        <div className="mx-12 my-4 h-full py-4">
          <div className="flex items-center justify-between border-b border-muted pb-4">
            <div className="flex flex-col">
              <h3 className="text-lg font-semibold">Account</h3>
              <p className="text-sm text-muted-foreground">
                {activeUser.data
                  ? `You are currently logged in as ${shortNpub(activeUser.data?.Npub)}`
                  : "You are not currently logged in"}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {activeUser.data ? (
                <Button variant="muted" onClick={handleLogout}>
                  Logout
                </Button>
              ) : (
                <LoginDialog>
                  <Button variant="muted">Login</Button>
                </LoginDialog>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
