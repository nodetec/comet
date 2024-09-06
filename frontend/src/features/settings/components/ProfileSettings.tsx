// import { useEffect, useState } from "react";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
// import { setSetting } from "~/api";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Check, Copy } from "lucide-react";
// import { useAppContext } from "~/store";
import { /* getPublicKey, */ nip19 } from "nostr-tools";
import { CopyToClipboard } from "react-copy-to-clipboard";
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
  nsec: z.string().refine(isValidNsec, {
    message: "Invalid nsec.",
  }),
});

export default function ProfileSettings() {
  const [loading, setLoading] = useState<boolean>(false);
  const [isNpubCopied, setIsNpubCopied] = useState(false);

  // const { settings, setSettings } = useAppContext();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      // nsec: settings.nsec || "", // Set the default value from settings
      nsec: "", // Set the default value from settings
    },
  });

  // If settings.nsec is not available at the initial render, update the form state once settings are fetched
  // useEffect(() => {
  //   if (settings.nsec) {
  //     form.reset({ nsec: settings.nsec });
  //   }
  // }, [settings.nsec, form]);

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setLoading(true);
    // const privateKey = nip19.decode(data.nsec).data as Uint8Array;
    // const publicKey = getPublicKey(privateKey);
    // const npub = nip19.npubEncode(publicKey);
    // const { nsec } = data;
    // await setSetting("nsec", nsec);
    // await setSetting("npub", npub);
    // setSettings({ ...settings, nsec: nsec, npub: npub });
    setLoading(false);
  }

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
    <Card className="bg-card/20">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Enter your profile Details</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex w-full items-center justify-start py-4">
          <div className="flex w-full flex-col gap-4">
            <Label htmlFor="create-dialog-npub-input">Npub</Label>
            <Input
              id="create-dialog-npub-input"
              name="create-dialog-npub-input"
              readOnly
              value="Need to get from DB"
              className="focus-visible:ring-0 disabled:cursor-pointer"
            />
          </div>
          <CopyToClipboard text="Need to get from DB" onCopy={handleNpubOnCopy}>
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
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="nsec"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secret Key</FormLabel>
                  <FormControl>
                    <Input placeholder="nsec" {...field} />
                  </FormControl>
                  <FormDescription>
                    Your secret key, keep this safe!
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button disabled={loading} type="submit">
              Save
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
