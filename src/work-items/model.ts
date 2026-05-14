export type WorkItemEntityType = "requirement" | "execution_task" | "bug" | "task";

export type WorkItemRef = {
  id: string;
  name: string | null;
};

export type WorkItemUser = {
  id: string;
  name: string | null;
};

export type WorkItemTeam = {
  id: string;
  name: string | null;
};

export type WorkItemEntity = {
  entity_type: WorkItemEntityType;
  task_id: string;
  number: number | null;
  summary: string;
  task_type: WorkItemRef | null;
  status: WorkItemRef | null;
  owner: WorkItemUser | null;
  assignee: WorkItemUser | null;
  team: WorkItemTeam | null;
  parent_task_id: string | null;
  url: string | null;
  updated_at?: string;
};

export type ResolutionStep = {
  step: string;
  value: string;
};

export type WorkItemDescription = {
  plain_text: string;
  html: string | null;
  rich_text: unknown;
};

export type CustomField = {
  id: string;
  name: string;
  value: unknown;
};

export type ResolveTaskResult = {
  input: string;
  matched: boolean;
  entity: WorkItemEntity | null;
  candidates: WorkItemEntity[];
  resolution_path: ResolutionStep[];
  raw_payload: unknown;
};

export type RequirementDetailResult = {
  entity: WorkItemEntity;
  description: WorkItemDescription;
  custom_fields: CustomField[];
  related_tasks: WorkItemEntity[];
  raw_payload: unknown;
};

export type ExecutionTasksResult = {
  requirement: WorkItemEntity;
  execution_tasks: WorkItemEntity[];
  raw_payload: unknown;
};

export type BugDetailResult = {
  entity: WorkItemEntity;
  description: WorkItemDescription;
  severity: WorkItemRef | null;
  priority: WorkItemRef | null;
  related_tasks: WorkItemEntity[];
  raw_payload: unknown;
};

export type BugParentRequirementResult = {
  bug: WorkItemEntity;
  requirement: WorkItemEntity | null;
  resolution_path: ResolutionStep[];
  raw_payload: unknown;
};

export type RequirementBugsResult = {
  requirement: WorkItemEntity;
  bugs: WorkItemEntity[];
  count: number;
  raw_payload: unknown;
};

export type TaskMessage = {
  id: string;
  author: WorkItemUser | null;
  created_at: string | null;
  plain_text: string;
  html: string | null;
};

export type TaskMessagesResult = {
  entity: WorkItemEntity;
  messages: TaskMessage[];
  raw_payload: unknown;
};
