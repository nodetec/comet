import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "~/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useAppState } from "~/store";
import { type Relay } from "$/types/Relay";
import { PlusIcon, X } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const nostrFormSchema = z.object({
  relays: z.array(
    z.object({
      url: z
        .string()
        .max(100, { message: "Must be 100 or fewer characters long" })
        .trim()
        .toLowerCase()
        .url({ message: "Please enter a valid URL." })
        .refine((url) => url.startsWith("wss://"), {
          message: "URL must begin with wss://",
        }),
      read: z.boolean(),
      write: z.boolean(),
    }),
  ),
});

type NostrFormValues = z.infer<typeof nostrFormSchema>;

type Props = {
  relays: Relay[];
};

export function RelaySettings({ relays }: Props) {
  const [loading, setLoading] = useState(false);
  const setRelays = useAppState((state) => state.setRelays);

  const defaultRelay = {
    relays: [
      {
        url: "wss://relay.damus.io",
        read: false,
        write: true,
      },
    ],
  };

  const form = useForm<NostrFormValues>({
    resolver: zodResolver(nostrFormSchema),
    defaultValues: {
      relays: relays.length > 0 ? relays : defaultRelay.relays,
    },
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    name: "relays",
    control: form.control,
  });

  function removeRelay(e: React.MouseEvent<HTMLButtonElement>, index: number) {
    e.preventDefault();
    if (fields.length === 1) return;
    remove(index);
  }

  function appendRelay(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();

    // check if the last relay has a URL using form's getValues method
    const values = form.getValues();
    const lastRelay = values.relays[values.relays.length - 1];
    if (!lastRelay?.url) return;

    append({ url: "", read: false, write: true });
  }

  // TODO
  // Handle if there are zero relays
  // zod might be able to check if a value is unique
  // Then add all relays instead of one relay at a time to the db - Create an add all service
  async function onSubmit(data: NostrFormValues) {
    setLoading(true);
    try {
      setRelays(data.relays);
      toast("Success", {
        description: "Relays updated",
      });
    } catch (error) {
      console.error("Nostr settings error: ", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col space-y-4">
      <ScrollArea type="scroll">
        <h1 className="border-accent mx-12 border-b py-4 text-lg font-bold">
          Relays
        </h1>

        <div className="mx-12 my-4 h-full py-4">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="max-w-md space-y-8"
            >
              <div>
                {fields.map((field, index) => (
                  <FormField
                    control={form.control}
                    key={field.id}
                    name={`relays.${index}.url`}
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
                <div className="mt-2 flex items-center gap-4">
                  <Button
                    id="nostr-settings-add-relay-btn"
                    name="nostr-settings-add-relay-btn"
                    type="button"
                    variant="outline"
                    size="sm"
                    className="disabled:cursor-pointer disabled:opacity-100"
                    disabled={loading}
                    onClick={(e) => appendRelay(e)}
                  >
                    <PlusIcon />
                    Relay
                  </Button>
                  <Button
                    id="nostr-settings-submit-relay-btn"
                    name="nostr-settings-submit-relay-btn"
                    type="submit"
                    variant="default"
                    size="sm"
                    className="disabled:cursor-pointer disabled:opacity-100"
                    disabled={loading}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </div>
      </ScrollArea>
    </div>
  );
}
