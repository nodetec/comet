import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";

export default function Settings() {
  return (
    <div className="flex flex-col p-8">
      <h1 className="mb-8 border-b pb-4 text-xl font-bold">Settings</h1>
      <div className="flex gap-x-20">
        <nav className="flex flex-col gap-y-4 text-sm text-muted-foreground">
          <span className="cursor-pointer">General</span>
          <span className="cursor-pointer">Editor</span>
          <span className="cursor-pointer">Theme</span>
          <span className="cursor-pointer font-semibold text-primary">
            Nostr
          </span>
          {/* <span>Support</span> */}
          {/* <span>Donate</span> */}
        </nav>

        <Card className="w-full bg-card/20">
          <CardHeader>
            <CardTitle>Nostr Keys</CardTitle>
            <CardDescription>
              Enter your Nostr Private Key to enable Nostr features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-y-4">
              <Input placeholder="nsec" />
            </form>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button>Save</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
