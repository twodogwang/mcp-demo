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

const docImageResourceSchema = z.object({
  type: z.literal("image"),
  resource_id: z.string(),
  ref_type: z.string().nullable(),
  ref_id: z.string().nullable(),
  alt: z.string().nullable(),
  caption: z.string().nullable(),
  filename: z.string().nullable(),
  mime_type: z.string().nullable(),
  size_bytes: z.number().int().min(0).nullable(),
  width: z.number().int().min(0).nullable(),
  height: z.number().int().min(0).nullable(),
  url: z.string().nullable(),
  error: z.string().nullable(),
});

export const getDocOutputSchema = z.object({
  doc: docMetadataSchema,
  markdown: z.string(),
  raw: rawViewSchema.optional(),
  resources: z.array(docImageResourceSchema).optional(),
});

export function parseGetDocInput(input: unknown) {
  return getDocInputSchema.parse(input);
}

export type GetDocInput = z.infer<typeof getDocInputSchema>;
export type GetDocOutput = z.infer<typeof getDocOutputSchema>;
