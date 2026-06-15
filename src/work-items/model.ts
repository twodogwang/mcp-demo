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

export type RequirementWikiPage = {
  page_id: string;
  team_id: string | null;
  title: string | null;
  url: string | null;
  source: string;
  error: string | null;
};

export type RequirementExternalLink = {
  url: string;
  kind: "prototype" | "translation_doc" | "external";
  source: string;
};

export type TaskRichResource = {
  type: "image";
  resource_id: string | null;
  src: string | null;
  mime_type: string | null;
  alt: string | null;
  ref_id: string | null;
  ref_type: string | null;
  source: string;
};

export type RequirementMaterialsCompleteness = {
  has_requirement_body: boolean;
  has_related_wiki_pages: boolean;
  has_external_links: boolean;
  has_rich_resources: boolean;
  missing: string[];
  next_actions: string[];
};

export type RequirementMaterialsResult = {
  requirement: WorkItemEntity;
  wiki_pages: RequirementWikiPage[];
  external_links: RequirementExternalLink[];
  rich_resources: TaskRichResource[];
  completeness: RequirementMaterialsCompleteness;
  raw_payload: unknown;
};

export type RelatedWikiPagesResult = {
  requirement: WorkItemEntity;
  wiki_pages: RequirementWikiPage[];
  raw_payload: unknown;
};

export type TaskRichResourcesResult = {
  entity: WorkItemEntity;
  resources: TaskRichResource[];
  raw_payload: unknown;
};

export type DownloadedResourceResult = {
  url: string;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number;
  content_base64: string;
};
