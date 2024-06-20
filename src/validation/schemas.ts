import { z } from "zod";

export const editorSettingsSchema = z.object({
  indent_unit: z.string().regex(/^([0-9]|[1-9][0-9]|100)$/, {
    message: "Must be an integer from 0 to 100",
  }),
  tab_size: z.string().regex(/^([0-9]|[1-9][0-9]|100)$/, {
    message: "Must be an integer from 0 to 100",
  }),
  font_size: z.string().regex(/^([1-9]|[1-9][0-9]|100)$/, {
    message: "Must be an integer from 1 to 100",
  }),
  line_height: z.string().regex(/^(([1-9](\.[0-9])?)|(10(\.0)?))$/, {
    message: "Must be a number with one decimal from 1.0 to 10.0",
  }),
});

export const partialEditorSettingsSchema = editorSettingsSchema.partial();
