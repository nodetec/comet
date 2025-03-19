"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
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
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { ScrollArea } from "~/components/ui/scroll-area-old";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.discriminatedUnion("syncMethod", [
  z.object({
    syncMethod: z.literal("no_sync"),
    url: z.string().optional(),
  }),
  z.object({
    syncMethod: z.literal("custom_sync"),
    url: z.string().min(2, "URL must be at least 2 characters."),
  }),
]);

type Props = {
  syncConfig:
    | { remote: { url: string | undefined }; method: "custom_sync" | "no_sync" }
    | null
    | undefined;
};

export function SyncSettings({ syncConfig }: Props) {
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      url: syncConfig?.remote.url ?? "",
      syncMethod: syncConfig?.method ?? "no_sync",
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    console.log(data);

    if (data.syncMethod === "no_sync") {
      await window.api.cancelSync();
      await queryClient.invalidateQueries({ queryKey: ["syncConfig"] });
      toast("Success", {
        description: "Sync settings saved.",
      });
      return;
    } else if (data.syncMethod === "custom_sync") {
      if (!data.url) {
        toast("Error", {
          description: "URL is required.",
        });
        return;
      }
      await window.api.syncDb(data.url);
      await queryClient.invalidateQueries({ queryKey: ["syncConfig"] });
    }
  }

  return (
    <div className="flex flex-col space-y-4">
      <ScrollArea type="scroll">
        <h1 className="border-accent mx-12 border-b py-4 text-lg font-bold">
          Sync
        </h1>

        <div className="mx-12 my-4 flex h-full flex-col space-y-8 py-4">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="w-2/3 space-y-6"
            >
              <FormField
                control={form.control}
                name="syncMethod"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Choose a sync method</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-1"
                      >
                        <FormItem className="flex items-center space-y-0 space-x-3">
                          <FormControl>
                            <RadioGroupItem value="no_sync" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Don't Sync
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-y-0 space-x-3">
                          <FormControl>
                            <RadioGroupItem value="custom_sync" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Custom Sync
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("syncMethod") === "custom_sync" && (
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Database URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="http(s)://user:password@hostname/database"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        URL for CouchDB database.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <Button type="submit">Submit</Button>
            </form>
          </Form>
        </div>
      </ScrollArea>
    </div>
  );
}
