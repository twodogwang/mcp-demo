import { z } from "zod";

export const searchDocsInputSchema = z.object({
  query: z.string().min(1, "query is required"),
  limit: z.number().int().min(1).max(20).default(5),
});

export const searchDocItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  updated_at: z.string().optional(),
});

export const searchDocsOutputSchema = z.object({
  items: z.array(searchDocItemSchema),
  count: z.number().int().min(0),
  limit: z.number().int().min(1).max(20),
});

export type SearchDocsInput = z.infer<typeof searchDocsInputSchema>;
export type SearchDocsOutput = z.infer<typeof searchDocsOutputSchema>;
