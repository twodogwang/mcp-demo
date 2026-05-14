import { z } from "zod";

export const workItemLookupInputSchema = z.object({
  ref: z.string().min(1),
});

export const workItemTaskInputSchema = z.object({
  task_id: z.string().min(1),
  team_id: z.string().min(1).optional(),
});

const nullableRefSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
  })
  .nullable();

const nullableUserSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
  })
  .nullable();

const nullableTeamSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
  })
  .nullable();

export const workItemEntitySchema = z.object({
  entity_type: z.enum(["requirement", "execution_task", "bug", "task"]),
  task_id: z.string(),
  number: z.number().int().nullable(),
  summary: z.string(),
  task_type: nullableRefSchema,
  status: nullableRefSchema,
  owner: nullableUserSchema,
  assignee: nullableUserSchema,
  team: nullableTeamSchema,
  parent_task_id: z.string().nullable(),
  url: z.string().nullable(),
  updated_at: z.string().optional(),
});

const resolutionStepSchema = z.object({
  step: z.string(),
  value: z.string(),
});

const descriptionSchema = z.object({
  plain_text: z.string(),
  html: z.string().nullable(),
  rich_text: z.unknown(),
});

const customFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.unknown(),
});

export const resolveTaskOutputSchema = z.object({
  input: z.string(),
  matched: z.boolean(),
  entity: workItemEntitySchema.nullable(),
  candidates: z.array(workItemEntitySchema),
  resolution_path: z.array(resolutionStepSchema),
  raw_payload: z.unknown(),
});

export const requirementDetailOutputSchema = z.object({
  entity: workItemEntitySchema,
  description: descriptionSchema,
  custom_fields: z.array(customFieldSchema),
  related_tasks: z.array(workItemEntitySchema),
  raw_payload: z.unknown(),
});

export const executionTasksOutputSchema = z.object({
  requirement: workItemEntitySchema,
  execution_tasks: z.array(workItemEntitySchema),
  raw_payload: z.unknown(),
});

export const bugDetailOutputSchema = z.object({
  entity: workItemEntitySchema,
  description: descriptionSchema,
  severity: nullableRefSchema,
  priority: nullableRefSchema,
  related_tasks: z.array(workItemEntitySchema),
  raw_payload: z.unknown(),
});

export const bugParentRequirementOutputSchema = z.object({
  bug: workItemEntitySchema,
  requirement: workItemEntitySchema.nullable(),
  resolution_path: z.array(resolutionStepSchema),
  raw_payload: z.unknown(),
});

export const requirementBugsOutputSchema = z.object({
  requirement: workItemEntitySchema,
  bugs: z.array(workItemEntitySchema),
  count: z.number().int().min(0),
  raw_payload: z.unknown(),
});

const taskMessageSchema = z.object({
  id: z.string(),
  author: nullableUserSchema,
  created_at: z.string().nullable(),
  plain_text: z.string(),
  html: z.string().nullable(),
});

export const taskMessagesOutputSchema = z.object({
  entity: workItemEntitySchema,
  messages: z.array(taskMessageSchema),
  raw_payload: z.unknown(),
});

export type WorkItemLookupInput = z.infer<typeof workItemLookupInputSchema>;
export type WorkItemTaskInput = z.infer<typeof workItemTaskInputSchema>;
