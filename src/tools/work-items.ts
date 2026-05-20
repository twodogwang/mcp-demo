import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  bugDetailOutputSchema,
  bugParentRequirementOutputSchema,
  executionTasksOutputSchema,
  requirementBugsOutputSchema,
  requirementDetailOutputSchema,
  requirementMaterialsOutputSchema,
  relatedWikiPagesOutputSchema,
  resolveTaskOutputSchema,
  taskRichResourcesOutputSchema,
  taskMessagesOutputSchema,
  workItemLookupInputSchema,
  workItemTaskInputSchema,
} from "../schemas/work-items.js";
import type { Runtime } from "../services/runtime.js";
import {
  createJsonToolResult,
  createToolErrorResult,
  readOnlyToolAnnotations,
} from "./shared.js";

export function registerWorkItemTools(
  server: McpServer,
  getRuntime: () => Promise<Runtime>,
): void {
  server.registerTool(
    "get_requirement_detail_by_ref",
    {
      title: "Get ONES Requirement Detail By Ref",
      description:
        "Get requirement body, fields, and related task facts by requirement number, task id, or task URL.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: requirementDetailOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getRequirementDetailByRef(ref));
      } catch (error) {
        return createToolErrorResult("get_requirement_detail_by_ref", error);
      }
    },
  );

  server.registerTool(
    "get_execution_tasks_by_ref",
    {
      title: "Get ONES Requirement Execution Tasks By Ref",
      description:
        "Get execution-task candidates by requirement number, task id, or task URL.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: executionTasksOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getExecutionTasksByRef(ref));
      } catch (error) {
        return createToolErrorResult("get_execution_tasks_by_ref", error);
      }
    },
  );

  server.registerTool(
    "extract_requirement_materials_by_ref",
    {
      title: "Extract ONES Requirement Materials By Ref",
      description:
        "Extract wiki pages, external links, rich resources, and completeness hints by requirement number, task id, or task URL.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: requirementMaterialsOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(
          await client.extractRequirementMaterialsByRef(ref),
        );
      } catch (error) {
        return createToolErrorResult("extract_requirement_materials_by_ref", error);
      }
    },
  );

  server.registerTool(
    "list_requirement_bugs_by_ref",
    {
      title: "List ONES Requirement Bugs By Ref",
      description:
        "List bugs under a requirement by requirement number, task id, or task URL when explicitly requested.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: requirementBugsOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.listRequirementBugsByRef(ref));
      } catch (error) {
        return createToolErrorResult("list_requirement_bugs_by_ref", error);
      }
    },
  );

  server.registerTool(
    "get_task_messages_by_ref",
    {
      title: "Get ONES Task Messages By Ref",
      description:
        "Get task comments/messages by task number, task id, or task URL.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: taskMessagesOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getTaskMessagesByRef(ref));
      } catch (error) {
        return createToolErrorResult("get_task_messages_by_ref", error);
      }
    },
  );

  server.registerTool(
    "get_related_wiki_pages_by_ref",
    {
      title: "Get ONES Requirement Related Wiki Pages By Ref",
      description:
        "Discover wiki page references by requirement number, task id, or task URL.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: relatedWikiPagesOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getRelatedWikiPagesByRef(ref));
      } catch (error) {
        return createToolErrorResult("get_related_wiki_pages_by_ref", error);
      }
    },
  );

  server.registerTool(
    "get_task_rich_resources_by_ref",
    {
      title: "Get ONES Task Rich Resources By Ref",
      description:
        "Extract rich-text image resources by task number, task id, or task URL.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: taskRichResourcesOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getTaskRichResourcesByRef(ref));
      } catch (error) {
        return createToolErrorResult("get_task_rich_resources_by_ref", error);
      }
    },
  );

  server.registerTool(
    "get_bug_detail_by_ref",
    {
      title: "Get ONES Bug Detail By Ref",
      description:
        "Get bug body, fields, and related task facts by bug number, task id, or task URL.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: bugDetailOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getBugDetailByRef(ref));
      } catch (error) {
        return createToolErrorResult("get_bug_detail_by_ref", error);
      }
    },
  );

  server.registerTool(
    "get_bug_parent_requirement_by_ref",
    {
      title: "Get ONES Bug Parent Requirement By Ref",
      description:
        "Resolve the parent requirement by bug number, task id, or task URL.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: bugParentRequirementOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getBugParentRequirementByRef(ref));
      } catch (error) {
        return createToolErrorResult("get_bug_parent_requirement_by_ref", error);
      }
    },
  );

  server.registerTool(
    "resolve_requirement",
    {
      title: "Resolve ONES Requirement",
      description:
        "Resolve an ONES requirement by number, task id, or task URL. Prefer *_by_ref tools for normal workflow reads.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: resolveTaskOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.resolveRequirement(ref));
      } catch (error) {
        return createToolErrorResult("resolve_requirement", error);
      }
    },
  );

  server.registerTool(
    "get_requirement_detail",
    {
      title: "Get ONES Requirement Detail",
      description:
        "Get requirement body, fields, and related task facts by task id. Prefer get_requirement_detail_by_ref when starting from a requirement number or URL.",
      inputSchema: workItemTaskInputSchema,
      outputSchema: requirementDetailOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ task_id, team_id }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(
          await client.getRequirementDetail(task_id, team_id),
        );
      } catch (error) {
        return createToolErrorResult("get_requirement_detail", error);
      }
    },
  );

  server.registerTool(
    "get_execution_tasks",
    {
      title: "Get ONES Requirement Execution Tasks",
      description:
        "Get execution-task candidates related to a requirement by task id. Prefer get_execution_tasks_by_ref when starting from a requirement number or URL.",
      inputSchema: workItemTaskInputSchema,
      outputSchema: executionTasksOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ task_id, team_id }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getExecutionTasks(task_id, team_id));
      } catch (error) {
        return createToolErrorResult("get_execution_tasks", error);
      }
    },
  );

  server.registerTool(
    "resolve_bug",
    {
      title: "Resolve ONES Bug",
      description:
        "Resolve an ONES bug by number, task id, or task URL. Prefer *_by_ref tools for normal workflow reads.",
      inputSchema: workItemLookupInputSchema,
      outputSchema: resolveTaskOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.resolveBug(ref));
      } catch (error) {
        return createToolErrorResult("resolve_bug", error);
      }
    },
  );

  server.registerTool(
    "get_bug_detail",
    {
      title: "Get ONES Bug Detail",
      description:
        "Get bug body, fields, and related task facts by task id. Prefer get_bug_detail_by_ref when starting from a bug number or URL.",
      inputSchema: workItemTaskInputSchema,
      outputSchema: bugDetailOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ task_id, team_id }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getBugDetail(task_id, team_id));
      } catch (error) {
        return createToolErrorResult("get_bug_detail", error);
      }
    },
  );

  server.registerTool(
    "get_bug_parent_requirement",
    {
      title: "Get ONES Bug Parent Requirement",
      description:
        "Resolve the parent requirement for a selected bug by task id. Prefer get_bug_parent_requirement_by_ref when starting from a bug number or URL.",
      inputSchema: workItemTaskInputSchema,
      outputSchema: bugParentRequirementOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ task_id, team_id }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(
          await client.getBugParentRequirement(task_id, team_id),
        );
      } catch (error) {
        return createToolErrorResult("get_bug_parent_requirement", error);
      }
    },
  );

  server.registerTool(
    "list_requirement_bugs",
    {
      title: "List ONES Requirement Bugs",
      description:
        "List bugs under a requirement by task id when explicitly requested. Prefer list_requirement_bugs_by_ref when starting from a requirement number or URL.",
      inputSchema: workItemTaskInputSchema,
      outputSchema: requirementBugsOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ task_id, team_id }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(
          await client.listRequirementBugs(task_id, team_id),
        );
      } catch (error) {
        return createToolErrorResult("list_requirement_bugs", error);
      }
    },
  );

  server.registerTool(
    "get_task_messages",
    {
      title: "Get ONES Task Messages",
      description:
        "Get task comments/messages by task id for requirement workflow context. Prefer get_task_messages_by_ref when starting from a number or URL.",
      inputSchema: workItemTaskInputSchema,
      outputSchema: taskMessagesOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ task_id, team_id }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getTaskMessages(task_id, team_id));
      } catch (error) {
        return createToolErrorResult("get_task_messages", error);
      }
    },
  );

  server.registerTool(
    "extract_requirement_materials",
    {
      title: "Extract ONES Requirement Materials",
      description:
        "Extract wiki pages, external links, rich resources, and completeness hints from a requirement task id. Prefer extract_requirement_materials_by_ref when starting from a requirement number or URL.",
      inputSchema: workItemTaskInputSchema,
      outputSchema: requirementMaterialsOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ task_id, team_id }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(
          await client.extractRequirementMaterials(task_id, team_id),
        );
      } catch (error) {
        return createToolErrorResult("extract_requirement_materials", error);
      }
    },
  );

  server.registerTool(
    "get_related_wiki_pages",
    {
      title: "Get ONES Requirement Related Wiki Pages",
      description:
        "Discover wiki page references attached to or linked from a requirement task id. Prefer get_related_wiki_pages_by_ref when starting from a requirement number or URL.",
      inputSchema: workItemTaskInputSchema,
      outputSchema: relatedWikiPagesOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ task_id, team_id }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getRelatedWikiPages(task_id, team_id));
      } catch (error) {
        return createToolErrorResult("get_related_wiki_pages", error);
      }
    },
  );

  server.registerTool(
    "get_task_rich_resources",
    {
      title: "Get ONES Task Rich Resources",
      description:
        "Extract rich-text image resources from a requirement, task, or bug body by task id. Prefer get_task_rich_resources_by_ref when starting from a number or URL.",
      inputSchema: workItemTaskInputSchema,
      outputSchema: taskRichResourcesOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ task_id, team_id }) => {
      try {
        const { client } = await getRuntime();
        return createJsonToolResult(await client.getTaskRichResources(task_id, team_id));
      } catch (error) {
        return createToolErrorResult("get_task_rich_resources", error);
      }
    },
  );
}
