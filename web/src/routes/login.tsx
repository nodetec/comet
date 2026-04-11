import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { nip19 } from "nostr-tools";
import { finalizeEvent } from "nostr-tools/pure";
import { Orbit, KeyRound, Lock } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { userLogin } from "~/server/user/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [nsecInput, setNsecInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitSignedEvent(signedEvent: unknown) {
    const result = await userLogin({
      data: {
        signedEvent: signedEvent as Parameters<
          typeof userLogin
        >[0]["data"]["signedEvent"],
      },
    });
    if (result.ok) {
      void navigate({ to: "/", replace: true });
    } else {
      setError(result.error ?? "Sign in failed");
    }
  }

  function createAuthEvent(secretKey: Uint8Array) {
    return finalizeEvent(
      {
        kind: 27_235,
        content: "",
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      },
      secretKey,
    );
  }

  async function handleExtensionSignIn() {
    setError("");
    setLoading(true);
    try {
      if (!window.nostr) {
        setError("Install a Nostr extension (Alby, nos2x) to sign in");
        return;
      }

      const event = {
        kind: 27_235,
        content: "",
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signed = await window.nostr.signEvent(event);
      await submitSignedEvent(signed);
    } catch {
      setError("Failed to sign in with extension");
    } finally {
      setLoading(false);
    }
  }

  async function handleNsecSignIn() {
    setError("");
    setLoading(true);
    try {
      const trimmed = nsecInput.trim();
      let secretKey: Uint8Array;

      if (trimmed.startsWith("nsec1")) {
        const decoded = nip19.decode(trimmed);
        if (decoded.type !== "nsec") {
          setError("Invalid nsec");
          return;
        }
        secretKey = decoded.data;
      } else if (/^[a-f0-9]{64}$/.test(trimmed)) {
        secretKey = new Uint8Array(
          trimmed.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
        );
      } else {
        setError("Enter a valid nsec or hex private key");
        return;
      }

      const signed = createAuthEvent(secretKey);
      await submitSignedEvent(signed);
    } catch {
      setError("Failed to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="bg-primary mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg">
            <Orbit className="text-primary-foreground h-5 w-5" />
          </div>
          <CardTitle className="text-xl">Sign in to Comet</CardTitle>
          <CardDescription>
            Use your Nostr identity to access your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            onClick={handleExtensionSignIn}
            disabled={loading}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {loading && !nsecInput ? "Signing in..." : "Sign in with Extension"}
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">or</span>
            <Separator className="flex-1" />
          </div>

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleNsecSignIn();
            }}
          >
            <Input
              type="password"
              placeholder="nsec1..."
              value={nsecInput}
              onChange={(e) => setNsecInput(e.target.value)}
              className="font-mono text-sm"
            />
            <Button
              className="w-full"
              variant="outline"
              type="submit"
              disabled={loading || !nsecInput.trim()}
            >
              <Lock className="mr-2 h-4 w-4" />
              {loading && nsecInput ? "Signing in..." : "Sign in with nsec"}
            </Button>
          </form>

          {error && (
            <p className="text-destructive text-center text-sm">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
