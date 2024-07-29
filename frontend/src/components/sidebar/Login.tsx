import { useEffect, useState } from "react";

import { CreateNostrKey } from "&/github.com/nodetec/captains-log/service/nostrkeyservice";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ArrowRightIcon, Check, Copy } from "lucide-react";
import * as nip19 from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { CopyToClipboard } from "react-copy-to-clipboard";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [nsec, setNsec] = useState("");
  const [npub, setNpub] = useState("");
  const [isNsecCopied, setIsNsecCopied] = useState(false);
  const [isNpubCopied, setIsNpubCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const generateKepair = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    let sk = generateSecretKey();
    setNsec(nip19.nsecEncode(sk));

    let pk = getPublicKey(sk);
    setNpub(nip19.npubEncode(pk));
  };

  const handleLogin = () => {
    CreateNostrKey(nsec, npub, true, true);
    setOpen(false);
    setLoading(false);
    setIsNsecCopied(false);
    setIsNpubCopied(false);
    setNsec("");
    setNpub("");
  };

  const handleNsecOnCopy = (_: string, result: boolean) => {
    setLoading(true);
    if (result) {
      setIsNsecCopied(true);
      setTimeout(() => setIsNsecCopied(false), 500);
    } else {
      alert("Failed to copy Nsec!");
    }
    setLoading(false);
  };

  const handleNpubOnCopy = (_: string, result: boolean) => {
    setLoading(true);
    if (result) {
      setIsNpubCopied(true);
      setTimeout(() => setIsNpubCopied(false), 500);
    } else {
      alert("Failed to copy Npub!");
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center gap-4 border-t py-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            id="sidebar-login-btn"
            name="sidebar-login-btn"
            type="button"
            variant="ghost"
            className="flex items-center gap-x-1 text-muted-foreground hover:bg-background"
          >
            <p className="text-sm">Login</p>
            <ArrowRightIcon className="h-3 w-3" />
          </Button>
        </DialogTrigger>
        <DialogContent className="pt-12 sm:max-w-[425px]">
          <DialogHeader className="items-start">
            <DialogTitle>Nostr Login</DialogTitle>
            <DialogDescription>
              Don't have a Nostr account?{" "}
              <button onClick={generateKepair} className="text-purple-500">
                Create nostr keypair
              </button>
            </DialogDescription>
          </DialogHeader>
          <div className="flex w-full items-center justify-start py-2">
            <div className="flex w-full flex-col gap-4">
              <Label htmlFor="create-dialog-nsec-input">Nsec</Label>
              <Input
                id="create-dialog-nsec-input"
                name="create-dialog-nsec-input"
                value={nsec}
              />
            </div>
            <CopyToClipboard text={nsec} onCopy={handleNsecOnCopy}>
              <Button
                id="create-dialog-nsec-copy-btn"
                name="create-dialog-nsec-copy-btn"
                type="button"
                variant="outline"
                className="ml-3 h-9 self-end rounded-md bg-transparent px-3 text-xs disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
              >
                {!isNsecCopied && <Copy className="h-4 w-4" />}
                {isNsecCopied && <Check className="h-4 w-4" />}
              </Button>
            </CopyToClipboard>
          </div>
          <div className="flex w-full items-center justify-start py-2">
            <div className="flex w-full flex-col gap-4">
              <Label htmlFor="create-dialog-npub-input">Npub</Label>
              <Input
                // disabled
                className="bg-secondary text-muted-foreground"
                id="create-dialog-npub-input"
                name="create-dialog-npub-input"
                readOnly
                value={npub}
              />
            </div>
            <CopyToClipboard text={npub} onCopy={handleNpubOnCopy}>
              <Button
                id="create-dialog-npub-copy-btn"
                name="create-dialog-nub-copy-btn"
                type="button"
                variant="outline"
                className="ml-3 h-9 self-end rounded-md bg-transparent px-3 text-xs disabled:pointer-events-none disabled:opacity-50"
                disabled={loading}
              >
                {!isNpubCopied && <Copy className="h-4 w-4" />}
                {isNpubCopied && <Check className="h-4 w-4" />}
              </Button>
            </CopyToClipboard>
          </div>
          <DialogFooter>
            <Button
              id="create-dialog-create-btn"
              name="create-dialog-create-btn"
              type="button"
              className="max-w-[18%]"
              onClick={handleLogin}
            >
              Login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
