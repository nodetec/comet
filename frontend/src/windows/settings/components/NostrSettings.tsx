import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as wails from "@wailsio/runtime";
import {
  Settings,
  SettingService,
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
import {
  settingArrayToString,
  settingStringToArray,
} from "~/lib/settings/utils";
import { X } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

type Props = {
  settings: Settings;
};

const nostrFormSchema = z.object({
  relays: z.array(
    z.object({
      value: z
        .string()
        .max(100, { message: "Must be 100 or fewer characters long" })
        .trim()
        .toLowerCase(),
    }),
  ),
});

type NostrFormValues = z.infer<typeof nostrFormSchema>;

export function NostrSettings({ settings }: Props) {
  const [loading, setLoading] = useState(false);

  function formatSettings() {
    const relayArr = settingStringToArray(settings.Relays);
    const relayObj: NostrFormValues = { relays: [] };
    relayArr.forEach(
      (relay, index) => (relayObj.relays[index] = { value: relay }),
    );
    return relayObj;
  }

  const queryClient = useQueryClient();

  // TODO
  // Where should the errors and loading be taken of?
  async function updateSetting(key, value) {
    await SettingService.UpdateSetting(key, value);
  }

  const mutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      updateSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      wails.Events.Emit({ name: "settingsChanged", data: "" });
    },
    onError: () => {},
  });

  const form = useForm<NostrFormValues>({
    resolver: zodResolver(nostrFormSchema),
    defaultValues: formatSettings(),
    mode: "onChange",
  });

  const { fields, append, remove } = useFieldArray({
    name: "relays",
    control: form.control,
  });

  function onSubmit(data: NostrFormValues) {
    setLoading(true);
    const relays: string[] = [];
    const prefix = "wss://";
    for (const obj of data.relays) {
      if (obj.value.startsWith(prefix)) {
        obj.value = obj.value.slice(prefix.length);
      }
      relays.push(...Object.values(obj));
    }
    const relaysString = settingArrayToString(relays);

    try {
      mutation.mutate({ key: "relays", value: relaysString });
    } catch (error) {
      console.error("Nostr settings error: ", error);
    } finally {
      setLoading(false);
    }
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
                  name={`relays.${index}.value`}
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
                onClick={() => append({ value: "" })}
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
