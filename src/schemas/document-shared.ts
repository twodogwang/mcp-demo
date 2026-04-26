import { z } from "zod";

export const documentSourceFormatSchema = z.enum(["html", "richtext-json", "plain"]);

export const docMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  updated_at: z.string().optional(),
  source_format: documentSourceFormatSchema,
});

export const llmDocumentViewSchema = z.object({
  type: z.literal("document"),
  source_format: documentSourceFormatSchema,
  children: z.array(z.any()),
  resources: z.array(z.any()).optional(),
});

export const documentSectionOutlineSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  level: z.number().int().min(0),
  estimated_chars: z.number().int().min(0),
  table_count: z.number().int().min(0),
  image_count: z.number().int().min(0),
  start_index: z.number().int().min(0),
  end_index: z.number().int().min(0),
});

export const documentChunkDetailSchema = z.object({
  cursor: z.string(),
  index: z.number().int().min(0),
  section_ids: z.array(z.string()),
  estimated_chars: z.number().int().min(0),
  start_index: z.number().int().min(0),
  end_index: z.number().int().min(0),
});
