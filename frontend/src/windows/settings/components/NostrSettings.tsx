import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import * as wails from "@wailsio/runtime";
import {
  Relay /* RelayService */,
} from "&/github.com/nodetec/captains-log/service";
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
    const relayObj: NostrFormValues = { relays: [] };
    if (relayData !== undefined && relayData.length > 0) {
      relayObj.relays = relayData;
    }
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

  // const queryClient = useQueryClient();

  // TODO
  // Where should the errors and loading be taken of?
  // async function createRelay(url, read, write, sync) {
  //   await RelayService.CreateRelay(url, read, write, sync);
  // }
  //
  // const mutation = useMutation({
  //   mutationFn: ({
  //     url,
  //     read,
  //     write,
  //     sync,
  //   }: {
  //     url: string;
  //     read: boolean;
  //     write: boolean;
  //     sync: boolean;
  //   }) => createRelay(url, read, write, sync),
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ["relays"] });
  //     wails.Events.Emit({ name: "relaysFormSave", data: "" });
  //   },
  //   onError: () => {},
  // });

  // async function deleteRelay(id) {
  //   await RelayService.DeleteRelay(id);
  // }

  // const deleteMutation = useMutation({
  //   mutationFn: ({ id }: { id: number }) => deleteRelay(id),
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ["relays"] });
  //     wails.Events.Emit({ name: "relaysFormSave", data: "" });
  //   },
  //   onError: () => {},
  // });

  // async function fetchRelays() {
  //   const relays = await RelayService.ListRelays();
  //   return relays;
  // }

  // const { data } = useQuery({
  //   queryKey: ["relays"],
  //   queryFn: () => fetchRelays(),
  // });

  // TODO
  // Handle if there are zero relays
  // zod might be able to check if a value is unique

  // Look at notestack component - RelayForm and RelaySettings to massage the data for the form
  // Form handles validation, adding, and removing
  // On save, first delete all relays in the db - Create a delete all service
  // Then add all relays instead of one relay at a time to the db - Create an add all service
  function onSubmit(data: NostrFormValues) {
    setLoading(true);
    console.log("data ", data);
    console.log("relayData ", relayData);
    if (data.relays.length > 0) {
      console.log("data.relays", data.relays);
      data.relays.forEach((relay) => {
        console.log("relay", relay);
        // if (relayData.some((obj) => obj.Url === relay.Url)) {
        //   console.log("Already in the array");
        // } else {
        //   console.log("Object does not exist in the array");
        //   try {
        //     mutation.mutate({
        //       url: relay.Url,
        //       read: relay.Read,
        //       write: relay.Write,
        //       sync: relay.Sync,
        //     });
        //   } catch (error) {
        //     console.error("Nostr settings error: ", error);
        //   }
        // }
      });
    }

    // TODO
    // Once Save is successful get list of relays or get each relay that was added

    setLoading(false);
  }

  return (
    <Card className="bg-card/20">
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
                            onClick={() => remove(index)}
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
                onClick={() =>
                  append({
                    Url: "",
                    Read: false,
                    Write: true,
                    Sync: false,
                  })
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
