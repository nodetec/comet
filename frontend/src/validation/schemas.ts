import { z } from "zod";

export const editorSettingsSchema = z.object({
  lineHeight: z.string().regex(/^(([1-4](\.[0-9])?)|(5(\.0)?))$/, {
    message: "Must be a number with one decimal from 1.0 to 5.0",
  }),
});

export const partialEditorSettingsSchema = editorSettingsSchema.partial();
