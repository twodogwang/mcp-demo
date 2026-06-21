import { z } from "zod";

export const getDocInputSchema = z.object({
  ref: z.string().min(1),
  include_raw: z.boolean().default(false),
  include_resources: z.boolean().default(true),
}).strict();

const docMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  updated_at: z.string().optional(),
  source_format: z.enum(["html", "richtext-json", "plain"]),
});

const rawViewSchema = z.object({
  content: z.string(),
});

export const getDocOutputSchema = z.object({
  doc: docMetadataSchema,
  markdown: z.string(),
  raw: rawViewSchema.optional(),
});

export function parseGetDocInput(input: unknown) {
  return getDocInputSchema.parse(input);
}

export type GetDocInput = z.infer<typeof getDocInputSchema>;
export type GetDocOutput = z.infer<typeof getDocOutputSchema>;
