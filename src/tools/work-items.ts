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
    "resolve_requirement",
    {
      title: "Resolve ONES Requirement",
      description: "Resolve an ONES requirement by number, task id, or task URL.",
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
      description: "Get requirement body, fields, and related task facts.",
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
      description: "Get execution-task candidates related to a requirement.",
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
      description: "Resolve an ONES bug by number, task id, or task URL.",
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
      description: "Get bug body, fields, and related task facts.",
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
      description: "Resolve the parent requirement for a selected bug.",
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
      description: "List bugs under a requirement when explicitly requested.",
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
      description: "Get task comments/messages for requirement workflow context.",
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
        "Extract wiki pages, external links, rich resources, and completeness hints from a requirement task.",
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
        "Discover wiki page references attached to or linked from a requirement task.",
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
        "Extract rich-text image resources from a requirement, task, or bug body.",
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
