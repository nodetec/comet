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
  uiTheme: z.string(),
});

export default function ThemeSettings() {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      uiTheme: "Default",
    },
  });

  function onSubmit(data: z.infer<typeof FormSchema>) {
    console.log(data);
  }

  return (
    <Card className="bg-card/20">
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>Configure your theme</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="uiTheme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>UI Theme</FormLabel>
                  <FormControl>
                    <Input placeholder="Default" {...field} />
                  </FormControl>
                  <FormDescription>
                    This styles the buttons, side bar, note list, and other
                    common components
                  </FormDescription>
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
