import { z } from "zod";

import {
  docMetadataSchema,
  documentSectionOutlineSchema,
} from "./document-shared.js";

export const getDocOutlineInputSchema = z.object({
  ref: z.string().min(1),
});

export const getDocOutlineOutputSchema = z.object({
  doc: docMetadataSchema,
  estimated_chars: z.number().int().min(0),
  section_count: z.number().int().min(0),
  sections: z.array(documentSectionOutlineSchema),
});
