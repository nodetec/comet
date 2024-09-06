import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as wails from "@wailsio/runtime";
import { Relay, RelayService } from "&/github.com/nodetec/captains-log/service";
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
  FormField,
  FormItem,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { X } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

type Props = {
  relayData: Relay[];
};

// TODO
// Where should the errors and loading be taken of?
async function createRelay(
  url: string,
  read: boolean,
  write: boolean,
  sync: boolean,
) {
  await RelayService.DeleteRelays();
  await RelayService.CreateRelay(url, read, write, sync);
}

const nostrFormSchema = z.object({
  relays: z
    .array(
      z.object({
        Url: z
          .string()
          .max(100, { message: "Must be 100 or fewer characters long" })
          .trim()
          .toLowerCase()
          .url({ message: "Please enter a valid URL." })
          .refine((url) => url.startsWith("wss://"), {
            message: "URL must begin with wss://",
          }),
        Read: z.boolean(),
        Write: z.boolean(),
        Sync: z.boolean(),
      }),
    )
    .default([{ Url: "", Read: false, Write: true, Sync: false }]),
});

type NostrFormValues = z.infer<typeof nostrFormSchema>;

export function NostrSettings({ relayData }: Props) {
  const [loading, setLoading] = useState(false);

  function formatRelayData() {
    // TODO
    // On Save fetch the relays again in the parent component or here
    const relayObj: NostrFormValues = { relays: [] };
    if (relayData !== undefined) {
      relayObj.relays = relayData;
    }

    console.log("formatRelayData ", relayObj);

    return relayObj;
  }

  const form = useForm<NostrFormValues>({
    resolver: zodResolver(nostrFormSchema),
    defaultValues: formatRelayData(),
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    name: "relays",
    control: form.control,
  });

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: ({
      url,
      read,
      write,
      sync,
    }: {
      url: string;
      read: boolean;
      write: boolean;
      sync: boolean;
    }) => createRelay(url, read, write, sync),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relays"] });
    },
    onError: () => {},
  });

  async function deleteRelays() {
    await RelayService.DeleteRelays();
  }

  const deleteMutation = useMutation({
    mutationFn: () => deleteRelays(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relays"] });
    },
    onError: () => {},
  });

  function removeRelay(e: React.MouseEvent<HTMLButtonElement>, index: number) {
    e.preventDefault();
    if (fields.length === 1) return;
    remove(index);
  }

  // function appendRelay(e: React.MouseEvent<HTMLButtonElement>) {
  //   e.preventDefault();
  //
  //   // check if the last relay has a URL
  //   // if it doesn't, don't append a new relay
  //   const lastRelay = fields[fields.length - 1];
  //   console.log("lastRelay ", lastRelay);
  //   if (!lastRelay?.Url) return;
  //
  //   append({ Url: "", Read: false, Write: true, Sync: false });
  // }

  // TODO
  // Handle if there are zero relays
  // zod might be able to check if a value is unique
  // Then add all relays instead of one relay at a time to the db - Create an add all service
  async function onSubmit(data: NostrFormValues) {
    setLoading(true);
    console.log("data ", data);
    console.log("relayData ", relayData);

    try {
      data.relays.forEach((relay) => {
        try {
          createMutation.mutate({
            url: relay.Url,
            read: relay.Read,
            write: relay.Write,
            sync: relay.Sync,
          });
        } catch (error) {
          console.error("Nostr settings create relay error: ", error);
        }
      });
    } catch (error) {
      console.error("Nostr settings delete relays error: ", error);
    } finally {
      // refetch();
      setLoading(false);
    }

    console.log("data after ", data);
  }

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle>Relays</CardTitle>
        <CardDescription>Configure your relays</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div>
              {fields.map((field, index) => (
                <FormField
                  control={form.control}
                  key={field.id}
                  name={`relays.${index}.Url`}
                  render={({ field }) => (
                    <FormItem className="pb-4">
                      <FormControl>
                        <div className="flex gap-4">
                          <Input
                            {...field}
                            className="disabled:cursor-text disabled:opacity-100"
                            disabled={loading}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 self-end rounded-md bg-transparent px-3 text-xs disabled:cursor-pointer disabled:opacity-100"
                            disabled={loading}
                            onClick={(e) => removeRelay(e, index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <Button
                id="nostr-settings-add-relay-btn"
                name="nostr-settings-add-relay-btn"
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 disabled:cursor-pointer disabled:opacity-100"
                disabled={loading}
                // onClick={(e) => appendRelay(e)}
                onClick={() =>
                  append({ Url: "", Read: false, Write: true, Sync: false })
                }
              >
                Add Relay
              </Button>
            </div>
            <Button
              id="nostr-settings-submit-relay-btn"
              name="nostr-settings-submit-relay-btn"
              type="submit"
              className="disabled:cursor-pointer disabled:opacity-100"
              disabled={loading}
            >
              Save
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
