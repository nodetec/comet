import { useEffect, useState } from "react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ArrowRightIcon, Check, Copy } from "lucide-react";
import * as nip19 from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { CreateNostrKey } from "&/github.com/nodetec/captains-log/service/nostrkeyservice";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [loginNsec, setLoginNsec] = useState("");
  const [createNsec, setCreateNsec] = useState("");
  const [createNpub, setCreateNpub] = useState("");
  const [isNsecCopied, setIsNsecCopied] = useState(false);
  const [isNpubCopied, setIsNpubCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const generateNsecAndNpub = () => {
    let sk = generateSecretKey();
    setCreateNsec(nip19.nsecEncode(sk));

    let pk = getPublicKey(sk);
    setCreateNpub(nip19.npubEncode(pk));
  };

  useEffect(() => {
    generateNsecAndNpub();
  }, []);

  const handleLoginBtnOnClick = () => {
    setLoading(true);
    console.log("Login btn was clicked");
    setLoading(false);
  };

  const handleCreateBtnOnClick = () => {
    CreateNostrKey(createNsec, createNpub, true, true);
    setOpen(false);
  };

  const handleNsecOnCopy = (text, result) => {
    setLoading(true);
    if (result) {
      setIsNsecCopied(true);
      setTimeout(() => setIsNsecCopied(false), 500);
    } else {
      alert("Failed to copy Nsec!");
    }
    setLoading(false);
  };

  const handleNpubOnCopy = (text, result) => {
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
        <DialogContent className="sm:max-w-[425px]">
          <Tabs defaultValue="login">
            <TabsList className="my-4 grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="create">Create</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <DialogHeader className="items-start">
                <DialogTitle>Login</DialogTitle>
                <DialogDescription>
                  Enter your Nostr private key (nsec)
                </DialogDescription>
              </DialogHeader>
              <div className="flex w-full flex-col items-start justify-center gap-4 py-4">
                <Label htmlFor="login-dialog-nsec-input">Nsec</Label>
                <Input
                  id="login-dialog-nsec-input"
                  name="login-dialog-nsec-input"
                  disabled={loading}
                  value={loginNsec}
                  onChange={(event) => setLoginNsec(event.currentTarget.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  id="login-dialog-login-btn"
                  name="login-dialog-login-btn"
                  type="button"
                  className="max-w-[18%]"
                  disabled={loading}
                  onClick={handleLoginBtnOnClick}
                >
                  Login
                </Button>
              </DialogFooter>
            </TabsContent>
            <TabsContent value="create">
              <DialogHeader className="items-start">
                <DialogTitle>Create</DialogTitle>
                <DialogDescription>
                  Generated Nostr private key (nsec) and public key (npub)
                </DialogDescription>
              </DialogHeader>
              <div className="flex w-full items-center justify-start py-4">
                <div className="flex w-full flex-col gap-4">
                  <Label htmlFor="create-dialog-nsec-input">Nsec</Label>
                  <Input
                    id="create-dialog-nsec-input"
                    name="create-dialog-nsec-input"
                    readOnly
                    value={createNsec}
                  />
                </div>
                <CopyToClipboard text={createNsec} onCopy={handleNsecOnCopy}>
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
              <div className="flex w-full items-center justify-start py-4">
                <div className="flex w-full flex-col gap-4">
                  <Label htmlFor="create-dialog-npub-input">Npub</Label>
                  <Input
                    id="create-dialog-npub-input"
                    name="create-dialog-npub-input"
                    readOnly
                    value={createNpub}
                  />
                </div>
                <CopyToClipboard text={createNpub} onCopy={handleNpubOnCopy}>
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
                  onClick={handleCreateBtnOnClick}
                >
                  Create
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
