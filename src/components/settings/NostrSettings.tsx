import { zodResolver } from "@hookform/resolvers/zod";
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
import { useForm } from "react-hook-form";
import { z } from "zod";

const FormSchema = z.object({
  nsec: z.string(),
});

export default function NostrSettings() {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      nsec: "",
    },
  });

  function onSubmit(data: z.infer<typeof FormSchema>) {
    console.log(data);
  }

  return (
    <Card className="bg-card/20">
      <CardHeader>
        <CardTitle>Nostr</CardTitle>
        <CardDescription>
          Enter your Nostr private key to enable Nostr features
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="nsec"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nostr Private Key</FormLabel>
                  <FormControl>
                    <Input placeholder="nsec" {...field} />
                  </FormControl>
                  <FormDescription>Nostr private key</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit">Save</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}