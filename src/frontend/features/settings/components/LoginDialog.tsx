import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { useAppState } from "~/store";
import { CheckIcon, CopyIcon } from "lucide-react";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import CopyToClipboard from "react-copy-to-clipboard";
import { useForm } from "react-hook-form";
import { z } from "zod";

const isValidNsec = (nsec: string) => {
  try {
    return nip19.decode(nsec).type === "nsec";
  } catch (e) {
    console.error("Error decoding nsec:", e);
    return false;
  }
};

const formSchema = z.object({
  npub: z.string(),
  nsec: z.string().refine(isValidNsec, {
    message: "Invalid nsec.",
  }),
});

interface Props {
  children: React.ReactNode;
}

export function LoginDialog({ children }: Props) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isNsecCopied, setIsNsecCopied] = useState(false);
  const [isNpubCopied, setIsNpubCopied] = useState(false);

  const setKeys = useAppState((state) => state.setKeys);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      npub: "",
      nsec: "",
    },
  });

  const { reset, watch, setValue } = form;

  const nsecValue = watch("nsec");
  const npubValue = watch("npub");

  const generateKepair = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const secretKey = generateSecretKey();
    const publicKey = getPublicKey(secretKey);
    const nsec = nip19.nsecEncode(secretKey);
    const npub = nip19.npubEncode(publicKey);

    reset({
      nsec,
      npub,
    });
    void form.trigger(["nsec", "npub"]);
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    // TODO: not sure why this doesn't work
    // if (!form.formState.isValid) {
    //   return;
    // }

    if (!isValidNsec(values.nsec)) {
      alert("Invalid nsec");
      return;
    }

    const { nsec, npub } = values;

    console.log("nsec", nsec);
    console.log("npub", npub);

    setKeys({ nsec, npub });

    setIsDialogOpen(false);
    setLoading(false);
    setIsNsecCopied(false);
    setIsNpubCopied(false);
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

  useEffect(() => {
    if (isValidNsec(nsecValue)) {
      const secretKey = nip19.decode(nsecValue).data as Uint8Array;
      const publicKey = getPublicKey(secretKey);
      const npub = nip19.npubEncode(publicKey);
      setValue("nsec", nsecValue, { shouldValidate: true });
      setValue("npub", npub, { shouldValidate: true });
    } else {
      setValue("npub", "", { shouldValidate: true });
    }
  }, [nsecValue, setValue]);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <div onClick={() => setIsDialogOpen(true)}>{children}</div>
      </DialogTrigger>
      <DialogContent aria-describedby="login" className="max-w-sm p-6">
        <DialogHeader>
          <DialogTitle>Login</DialogTitle>
          <DialogDescription>
            Don't have a Nostr account?{" "}
            <button
              onClick={generateKepair}
              className="text-primary focus-visible:ring-0 focus-visible:outline-none"
            >
              Create keypair
            </button>
          </DialogDescription>
        </DialogHeader>
        {/* Add your registration form here */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="flex w-full flex-col items-center justify-start gap-y-6 py-2">
              <FormField
                control={form.control}
                name="nsec"
                render={({ field }) => (
                  <FormItem className="flex w-full flex-col gap-2">
                    <FormLabel>Nsec</FormLabel>
                    <FormControl>
                      <div className="flex gap-4">
                        <Input
                          className="overflow-ellipsis"
                          id="create-dialog-nsec-input"
                          placeholder="nsec"
                          {...field}
                        />
                        <CopyToClipboard
                          text={nsecValue}
                          onCopy={handleNsecOnCopy}
                        >
                          <Button
                            id="create-dialog-nsec-copy-btn"
                            name="create-dialog-nsec-copy-btn"
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={loading}
                          >
                            {!isNsecCopied && <CopyIcon className="h-3 w-3" />}
                            {isNsecCopied && <CheckIcon className="h-3 w-3" />}
                          </Button>
                        </CopyToClipboard>
                      </div>
                    </FormControl>
                    {/* <FormDescription> */}
                    {/*   This is your private key. Keep it safe and don't share */}
                    {/*   it with anyone. */}
                    {/* </FormDescription> */}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="npub"
                render={({ field }) => (
                  <FormItem className="flex w-full flex-col gap-2">
                    <FormLabel>Npub</FormLabel>
                    <FormControl>
                      <div className="flex gap-4">
                        <Input
                          className="overflow-ellipsis"
                          id="create-dialog-npub-input"
                          disabled
                          placeholder="npub"
                          {...field}
                        />

                        <CopyToClipboard
                          text={npubValue}
                          onCopy={handleNpubOnCopy}
                        >
                          <Button
                            id="create-dialog-npub-copy-btn"
                            name="create-dialog-nub-copy-btn"
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={loading}
                          >
                            {!isNpubCopied && <CopyIcon className="h-3 w-3" />}
                            {isNpubCopied && <CheckIcon className="h-3 w-3" />}
                          </Button>
                        </CopyToClipboard>
                      </div>
                    </FormControl>
                    {/* <FormDescription> */}
                    {/*   This is your public key. Share should share this key.*/}
                    {/*   it with anyone. */}
                    {/* </FormDescription> */}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <div className="flex w-full flex-col items-center justify-start gap-y-6 py-2">
                <Button
                  id="create-dialog-create-btn"
                  name="create-dialog-create-btn"
                  type="submit"
                  className="w-full"
                  variant="secondary"
                >
                  Login
                </Button>

                <Button className="w-full" variant="default">
                  Login with Keystash
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
