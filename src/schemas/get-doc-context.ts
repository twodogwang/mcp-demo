import { z } from "zod";

import { docMetadataSchema, llmDocumentViewSchema } from "./document-shared.js";

export const getDocContextInputSchema = z.object({
  ref: z.string().min(1),
  question: z.string().min(1),
  mode: z.enum(["auto"]).default("auto"),
  max_chars: z.number().int().min(1).max(50000).default(12000),
  include_resources: z.boolean().default(true),
});

export const getDocContextOutputSchema = z.object({
  doc: docMetadataSchema,
  strategy: z.enum(["outline_only", "targeted_sections", "full_chunks", "full_document"]),
  reason: z.string(),
  selected_sections: z.array(z.string()),
  consumed_chunks: z.array(z.number().int().min(0)),
  truncated: z.boolean(),
  context: llmDocumentViewSchema,
});
