import { z } from "zod";

import {
  docMetadataSchema,
  documentSectionOutlineSchema,
  llmDocumentViewSchema,
} from "./document-shared.js";

export const getDocSectionInputSchema = z.object({
  ref: z.string().min(1),
  section_id: z.string().min(1),
  include_descendants: z.boolean().default(false),
  include_resources: z.boolean().default(true),
});

export const getDocSectionOutputSchema = z.object({
  doc: docMetadataSchema,
  section: documentSectionOutlineSchema,
  content: llmDocumentViewSchema,
  truncated: z.boolean(),
});
