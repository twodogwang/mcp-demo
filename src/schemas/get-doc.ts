import { z } from "zod";

export const getDocInputSchema = z.object({
  ref: z.string().min(1),
  view: z.enum(["llm", "human", "both"]).default("llm"),
  include_raw: z.boolean().default(false),
  include_resources: z.boolean().default(true),
});

const docMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  updated_at: z.string().optional(),
  source_format: z.enum(["html", "richtext-json", "plain"]),
});

const llmViewSchema = z.object({
  type: z.literal("document"),
  source_format: z.enum(["html", "richtext-json", "plain"]),
  children: z.array(z.any()),
  resources: z.array(z.any()).optional(),
});

const humanViewSchema = z.object({
  format: z.literal("markdown"),
  content: z.string(),
});

const rawViewSchema = z.object({
  content: z.string(),
});

export const getDocOutputSchema = z.object({
  doc: docMetadataSchema,
  llm_view: llmViewSchema.optional(),
  human_view: humanViewSchema.optional(),
  raw: rawViewSchema.optional(),
});

export function parseGetDocInput(input: unknown) {
  return getDocInputSchema.parse(input);
}

export type GetDocInput = z.infer<typeof getDocInputSchema>;
export type GetDocOutput = z.infer<typeof getDocOutputSchema>;
