import { z } from "zod";

import {
  docMetadataSchema,
  documentChunkDetailSchema,
  llmDocumentViewSchema,
} from "./document-shared.js";

export const getDocChunksInputSchema = z.object({
  ref: z.string().min(1),
  cursor: z.string().nullable().default(null),
  max_chars: z.number().int().min(1).max(50000).default(6000),
  include_resources: z.boolean().default(true),
});

export const getDocChunksOutputSchema = z.object({
  doc: docMetadataSchema,
  chunk: documentChunkDetailSchema,
  content: llmDocumentViewSchema,
  has_more: z.boolean(),
  next_cursor: z.string().nullable(),
});
