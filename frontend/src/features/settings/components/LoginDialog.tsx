import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AppService } from "&/comet/backend/service";
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
import { CheckIcon, CopyIcon } from "lucide-react";
import * as nip19 from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import CopyToClipboard from "react-copy-to-clipboard";
import { useForm } from "react-hook-form";
import { z } from "zod";

const isValidNsec = (nsec: string) => {
  try {
    return nip19.decode(nsec).type === "nsec";
  } catch (e) {
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

  const queryClient = useQueryClient();

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
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!form.formState.isValid) {
      return;
    }

    const { nsec, npub } = values;

    await AppService.CreateUser(nsec, npub, true);

    await queryClient.invalidateQueries({ queryKey: ["activeUser"] });

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
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle>Register</DialogTitle>
          <DialogDescription>
            Don't have a Nostr account?{" "}
            <button
              onClick={generateKepair}
              className="text-sky-500/90 focus-visible:outline-none focus-visible:ring-0"
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
                            {!isNsecCopied && <CopyIcon className="h-4 w-4" />}
                            {isNsecCopied && <CheckIcon className="h-4 w-4" />}
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
                            {!isNpubCopied && <CopyIcon className="h-4 w-4" />}
                            {isNpubCopied && <CheckIcon className="h-4 w-4" />}
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
              <Button
                id="create-dialog-create-btn"
                name="create-dialog-create-btn"
                type="submit"
                className="max-w-[18%]"
                variant="muted"
              >
                Login
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
