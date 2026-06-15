import type { EndpointDiscovery } from "./discovery/endpoint-discovery.js";
import type {
  DocDetail,
  DocMetadata,
  DocumentChunkResult,
  DocumentContextResult,
  DocumentContextStrategy,
  DocumentOutline,
  DocumentResource,
  DocumentSectionDetail,
  GetDocOptions,
  GetDocChunksOptions,
  GetDocContextOptions,
  GetDocSectionOptions,
  LlmDocumentView,
  ParsedDocument,
} from "./documents/model.js";
import { buildDocumentChunks, getChunkSlice, parseChunkCursor } from "./documents/chunks.js";
import { buildDocumentOutline, getSectionSlice } from "./documents/outline.js";
import { detectDocumentSource } from "./documents/source.js";
import { AppError } from "./errors.js";
import { logInfo } from "./logger.js";
import { normalizeContent } from "./normalizer.js";
import { parseHtmlDocument } from "./documents/parse-html.js";
import { parseRichTextDocument } from "./documents/parse-rich-text.js";
import { renderMarkdown } from "./documents/render-markdown.js";
import { createOcrRunner } from "./ocr/ocr-client.js";
import type { OcrConfig } from "./config.js";
import type { ParsedRef } from "./ref-parser.js";
import type {
  BugDetailResult,
  BugParentRequirementResult,
  CustomField,
  DownloadedResourceResult,
  ExecutionTasksResult,
  RequirementBugsResult,
  RequirementDetailResult,
  ResolveTaskResult,
  ResolutionStep,
  TaskMessage,
  TaskMessagesResult,
  RelatedWikiPagesResult,
  RequirementExternalLink,
  RequirementMaterialsCompleteness,
  RequirementMaterialsResult,
  RequirementWikiPage,
  TaskRichResource,
  TaskRichResourcesResult,
  WorkItemDescription,
  WorkItemEntity,
  WorkItemEntityType,
  WorkItemRef,
  WorkItemUser,
} from "./work-items/model.js";

export type SessionProvider = {
  getValidAuthHeaders(): Promise<Record<string, string>>;
  invalidate(): void;
};

export type OnesClientConfig = {
  baseUrl: string;
  defaultTeamId?: string | null;
  timeoutMs: number;
  maxContentChars: number;
  ocr: OcrConfig;
};

export type SearchDocItem = {
  id: string;
  title: string;
  updated_at?: string;
};

type LinkedDoc = {
  id: string;
  updatedAt: number;
};

type LoadedDocument = {
  doc: DocMetadata;
  raw: string;
  parsed: ParsedDocument;
};

type ParsedTaskUrl = {
  teamId: string;
  taskId?: string;
  displayIdPath?: string;
};

const DEFAULT_GET_DOC_OPTIONS: GetDocOptions = {
  view: "llm",
  includeRaw: false,
  includeResources: true,
};

const DEFAULT_GET_DOC_SECTION_OPTIONS: GetDocSectionOptions = {
  includeDescendants: false,
  includeResources: true,
};

const SEARCH_TASKS_BY_NUMBER_QUERY = `
  query GROUP_TASK_DATA($groupBy: GroupBy, $groupOrderBy: OrderBy, $orderBy: OrderBy, $filterGroup: [Filter!], $search: Search, $pagination: Pagination, $limit: Int) {
    buckets(groupBy: $groupBy, orderBy: $groupOrderBy, pagination: $pagination, filter: $search) {
      key
      tasks(filterGroup: $filterGroup, orderBy: $orderBy, limit: $limit, includeAncestors: { pathField: "path" }) {
        key uuid number name
        issueType { uuid name detailType }
        status { uuid name category }
        priority { value }
        assign { uuid name }
        owner { uuid name }
        project { uuid name }
      }
    }
  }
`;

export class OnesClient {
  private readonly ocrRunner: ReturnType<typeof createOcrRunner>;

  constructor(
    private readonly cfg: OnesClientConfig,
    private readonly sessions: SessionProvider,
    private readonly discovery: EndpointDiscovery,
  ) {
    this.ocrRunner = createOcrRunner(cfg.ocr);
  }

  async searchDocs(query: string, limit: number): Promise<SearchDocItem[]> {
    const authHeaders = await this.sessions.getValidAuthHeaders();
    const searchPath = await this.discovery.resolveSearchPath(authHeaders);

    const data = await this.requestJson<Record<string, unknown>>(searchPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });

    const rawItems = this.pickArrayField(data, ["items", "list", "data"]);

    return rawItems.map((item) => ({
      id: String(item.id ?? item.doc_id ?? item.docId ?? ""),
      title: String(item.title ?? item.name ?? ""),
      updated_at: item.updated_at
        ? String(item.updated_at)
        : item.updatedAt
          ? String(item.updatedAt)
          : undefined,
    }));
  }

  async getDoc(
    docId: string,
    options: GetDocOptions = DEFAULT_GET_DOC_OPTIONS,
  ): Promise<DocDetail> {
    const loaded = await this.loadDoc(docId);
    return this.buildDocDetailFromLoaded(loaded, options);
  }

  async getPageDoc(
    teamId: string,
    pageId: string,
    options: GetDocOptions = DEFAULT_GET_DOC_OPTIONS,
  ): Promise<DocDetail> {
    const loaded = await this.loadPageDoc(teamId, pageId);
    return this.buildDocDetailFromLoaded(loaded, options);
  }

  async getDocByRequirementId(
    requirementId: string,
    options: GetDocOptions = DEFAULT_GET_DOC_OPTIONS,
  ): Promise<DocDetail> {
    const loaded = await this.loadDocByRequirementId(requirementId);
    return this.buildDocDetailFromLoaded(loaded, options);
  }

  async getDocOutline(docId: string): Promise<DocumentOutline> {
    const loaded = await this.loadDoc(docId);
    return this.buildOutlineFromLoaded(loaded);
  }

  async getDocSection(
    docId: string,
    sectionId: string,
    options: GetDocSectionOptions = DEFAULT_GET_DOC_SECTION_OPTIONS,
  ): Promise<DocumentSectionDetail> {
    const loaded = await this.loadDoc(docId);
    return this.buildSectionFromLoaded(loaded, sectionId, options);
  }

  async getDocChunks(
    docId: string,
    options: GetDocChunksOptions,
  ): Promise<DocumentChunkResult> {
    const loaded = await this.loadDoc(docId);
    return this.buildChunksFromLoaded(loaded, options);
  }

  async getDocContext(
    docId: string,
    options: GetDocContextOptions,
  ): Promise<DocumentContextResult> {
    const loaded = await this.loadDoc(docId);
    return this.buildContextFromLoaded(loaded, options);
  }

  async getDocOutlineByParsedRef(parsedRef: ParsedRef): Promise<DocumentOutline> {
    const loaded = await this.loadByParsedRef(parsedRef);
    return this.buildOutlineFromLoaded(loaded);
  }

  async getDocSectionByParsedRef(
    parsedRef: ParsedRef,
    sectionId: string,
    options: GetDocSectionOptions = DEFAULT_GET_DOC_SECTION_OPTIONS,
  ): Promise<DocumentSectionDetail> {
    const loaded = await this.loadByParsedRef(parsedRef);
    return this.buildSectionFromLoaded(loaded, sectionId, options);
  }

  async getDocChunksByParsedRef(
    parsedRef: ParsedRef,
    options: GetDocChunksOptions,
  ): Promise<DocumentChunkResult> {
    const loaded = await this.loadByParsedRef(parsedRef);
    return this.buildChunksFromLoaded(loaded, options);
  }

  async getDocContextByParsedRef(
    parsedRef: ParsedRef,
    options: GetDocContextOptions,
  ): Promise<DocumentContextResult> {
    const loaded = await this.loadByParsedRef(parsedRef);
    return this.buildContextFromLoaded(loaded, options);
  }

  async resolveRequirement(ref: string): Promise<ResolveTaskResult> {
    return this.resolveTask(ref, "requirement");
  }

  async getRequirementDetail(
    taskId: string,
    teamId?: string,
  ): Promise<RequirementDetailResult> {
    const raw = await this.loadTaskInfo(taskId, teamId);
    const entity = this.normalizeTaskEntity(raw, "requirement", teamId);

    return {
      entity,
      description: this.normalizeDescription(raw),
      custom_fields: this.normalizeCustomFields(raw),
      related_tasks: this.normalizeRelatedTasks(raw, teamId),
      raw_payload: raw,
    };
  }

  async getExecutionTasks(
    taskId: string,
    teamId?: string,
  ): Promise<ExecutionTasksResult> {
    const detail = await this.getRequirementDetail(taskId, teamId);
    return {
      requirement: detail.entity,
      execution_tasks: detail.related_tasks.filter(
        (entity) => entity.entity_type === "execution_task" || entity.entity_type === "task",
      ),
      raw_payload: detail.raw_payload,
    };
  }

  async resolveBug(ref: string): Promise<ResolveTaskResult> {
    return this.resolveTask(ref, "bug");
  }

  async getBugDetail(taskId: string, teamId?: string): Promise<BugDetailResult> {
    const raw = await this.loadTaskInfo(taskId, teamId);
    const entity = this.normalizeTaskEntity(raw, "bug", teamId);

    return {
      entity,
      description: this.normalizeDescription(raw),
      severity: this.normalizeRef(raw.severity ?? raw.severity_level),
      priority: this.normalizeRef(raw.priority),
      related_tasks: this.normalizeRelatedTasks(raw, teamId),
      raw_payload: raw,
    };
  }

  async getBugParentRequirement(
    taskId: string,
    teamId?: string,
  ): Promise<BugParentRequirementResult> {
    const detail = await this.getBugDetail(taskId, teamId);
    const requirement =
      detail.related_tasks.find((entity) => entity.entity_type === "requirement") ?? null;
    const resolutionPath: ResolutionStep[] = [
      { step: "inspect_related_tasks", value: taskId },
    ];

    if (requirement) {
      resolutionPath.push({
        step: "resolve_requirement_from_related_task",
        value: requirement.task_id,
      });
    }

    return {
      bug: detail.entity,
      requirement,
      resolution_path: resolutionPath,
      raw_payload: detail.raw_payload,
    };
  }

  async listRequirementBugs(
    taskId: string,
    teamId?: string,
  ): Promise<RequirementBugsResult> {
    const detail = await this.getRequirementDetail(taskId, teamId);
    const bugs = detail.related_tasks.filter((entity) => entity.entity_type === "bug");

    return {
      requirement: detail.entity,
      bugs,
      count: bugs.length,
      raw_payload: detail.raw_payload,
    };
  }

  async getTaskMessages(
    taskId: string,
    teamId?: string,
  ): Promise<TaskMessagesResult> {
    const raw = await this.loadTaskInfo(taskId, teamId);

    return {
      entity: this.normalizeTaskEntity(raw, "task", teamId),
      messages: this.normalizeMessages(raw),
      raw_payload: raw,
    };
  }

  async extractRequirementMaterials(
    taskId: string,
    teamId?: string,
  ): Promise<RequirementMaterialsResult> {
    const raw = await this.loadTaskInfo(taskId, teamId);
    const requirement = this.normalizeTaskEntity(raw, "requirement", teamId);
    const textSources = this.collectMaterialTextSources(raw);
    const wikiPages = this.extractRequirementWikiPages(
      raw,
      textSources,
      requirement.team?.id ?? teamId ?? null,
    );
    const externalLinks = this.extractRequirementExternalLinks(textSources);
    const richResources = this.extractTaskRichResourcesFromTextSources(textSources);

    return {
      requirement,
      wiki_pages: wikiPages,
      external_links: externalLinks,
      rich_resources: richResources,
      completeness: this.buildRequirementMaterialsCompleteness(
        this.normalizeDescription(raw),
        wikiPages,
        externalLinks,
        richResources,
      ),
      raw_payload: raw,
    };
  }

  async getRelatedWikiPages(
    taskId: string,
    teamId?: string,
  ): Promise<RelatedWikiPagesResult> {
    const materials = await this.extractRequirementMaterials(taskId, teamId);
    return {
      requirement: materials.requirement,
      wiki_pages: materials.wiki_pages,
      raw_payload: materials.raw_payload,
    };
  }

  async getTaskRichResources(
    taskId: string,
    teamId?: string,
  ): Promise<TaskRichResourcesResult> {
    const raw = await this.loadTaskInfo(taskId, teamId);
    return {
      entity: this.normalizeTaskEntity(raw, "task", teamId),
      resources: this.extractTaskRichResourcesFromTextSources(
        this.collectMaterialTextSources(raw),
      ),
      raw_payload: raw,
    };
  }

  async downloadResource(url: string): Promise<DownloadedResourceResult> {
    const normalizedUrl = this.normalizeDownloadUrl(url);
    const response = await this.requestResponse(normalizedUrl, { method: "GET" }, true, true);
    const bytes = new Uint8Array(await response.arrayBuffer());

    return {
      url: normalizedUrl,
      filename: this.extractFilename(response, normalizedUrl),
      mime_type: response.headers.get("content-type"),
      size_bytes: this.extractResponseSize(response, bytes.byteLength),
      content_base64: Buffer.from(bytes).toString("base64"),
    };
  }

  private collectMaterialTextSources(
    raw: Record<string, unknown>,
  ): Array<{ source: string; text: string }> {
    const sources: Array<{ source: string; text: string }> = [];
    const add = (source: string, value: unknown) => {
      if (typeof value === "string" && value.trim()) {
        sources.push({ source, text: value });
      }
    };

    add("desc", raw.desc);
    add("desc_rich", raw.desc_rich);
    add("description", raw.description);
    add("description_html", raw.description_html);
    add("html", raw.html);

    for (const field of this.pickArrayField(raw, ["field_values", "fieldValues"])) {
      const fieldId = this.pickString(field, ["field_uuid", "fieldId", "uuid", "id"]);
      add(fieldId ? `field_values.${fieldId}` : "field_values", field.value);
    }

    for (const field of this.pickArrayField(raw, ["custom_fields", "customFields"])) {
      const fieldId = this.pickString(field, ["field_uuid", "fieldId", "uuid", "id"]);
      add(fieldId ? `custom_fields.${fieldId}` : "custom_fields", field.value);
    }

    return sources;
  }

  private extractRequirementWikiPages(
    raw: Record<string, unknown>,
    textSources: Array<{ source: string; text: string }>,
    fallbackTeamId: string | null,
  ): RequirementWikiPage[] {
    const pages = new Map<string, RequirementWikiPage>();
    const addPage = (page: RequirementWikiPage) => {
      const key = `${page.team_id ?? ""}:${page.page_id}`;
      if (!pages.has(key)) {
        pages.set(key, page);
      }
    };

    for (const page of this.pickArrayField(raw, [
      "related_wiki_pages",
      "relatedWikiPages",
    ])) {
      const pageId = this.pickString(page, ["uuid", "id", "page_id", "pageId"]);
      if (!pageId) {
        continue;
      }
      const teamId =
        this.pickString(page, ["team_uuid", "team_id", "teamId"]) ?? fallbackTeamId;
      addPage({
        page_id: pageId,
        team_id: teamId,
        title: this.pickString(page, ["title", "name"]),
        url:
          teamId && pageId
            ? `${this.cfg.baseUrl.replace(/\/$/, "")}/wiki#/team/${encodeURIComponent(teamId)}/page/${encodeURIComponent(pageId)}`
            : null,
        source: "related_wiki_pages",
        error: this.pickString(page, ["errorMessage", "error_message", "error"]),
      });
    }

    for (const source of textSources) {
      for (const url of this.extractUrls(source.text)) {
        const parsed = this.parseWikiPageUrl(url, fallbackTeamId);
        if (!parsed) {
          continue;
        }
        addPage({
          page_id: parsed.pageId,
          team_id: parsed.teamId,
          title: null,
          url,
          source: source.source,
          error: null,
        });
      }
    }

    return Array.from(pages.values());
  }

  private extractRequirementExternalLinks(
    textSources: Array<{ source: string; text: string }>,
  ): RequirementExternalLink[] {
    const links = new Map<string, RequirementExternalLink>();
    const resourceUrls = new Set(
      this.extractTaskRichResourcesFromTextSources(textSources)
        .map((resource) => resource.src)
        .filter((src): src is string => Boolean(src)),
    );
    for (const source of textSources) {
      for (const url of this.extractUrls(source.text)) {
        if (this.parseWikiPageUrl(url, null) || resourceUrls.has(url)) {
          continue;
        }
        const kind = this.classifyExternalLink(url);
        const key = `${kind}:${url}`;
        if (!links.has(key)) {
          links.set(key, { url, kind, source: source.source });
        }
      }
    }
    return Array.from(links.values());
  }

  private extractTaskRichResourcesFromTextSources(
    textSources: Array<{ source: string; text: string }>,
  ): TaskRichResource[] {
    const resources = new Map<string, TaskRichResource>();
    for (const source of textSources) {
      const imageTags = source.text.match(/<img\b[^>]*>/gi) ?? [];
      for (const tag of imageTags) {
        const src = this.readHtmlAttribute(tag, "src");
        const resourceId = this.readHtmlAttribute(tag, "data-uuid");
        const key = resourceId ?? src ?? `${source.source}:${resources.size}`;
        if (!resources.has(key)) {
          resources.set(key, {
            type: "image",
            resource_id: resourceId,
            src,
            mime_type: this.readHtmlAttribute(tag, "data-mime"),
            alt: this.readHtmlAttribute(tag, "alt"),
            ref_id: this.readHtmlAttribute(tag, "data-ref-id"),
            ref_type: this.readHtmlAttribute(tag, "data-ref-type"),
            source: source.source,
          });
        }
      }
    }
    return Array.from(resources.values());
  }

  private buildRequirementMaterialsCompleteness(
    description: WorkItemDescription,
    wikiPages: RequirementWikiPage[],
    externalLinks: RequirementExternalLink[],
    richResources: TaskRichResource[],
  ): RequirementMaterialsCompleteness {
    const hasRequirementBody = Boolean(description.plain_text.trim());
    const checks = {
      has_requirement_body: hasRequirementBody,
      has_related_wiki_pages: wikiPages.length > 0,
      has_external_links: externalLinks.length > 0,
      has_rich_resources: richResources.length > 0,
    };
    const missing: string[] = [];
    const nextActions: string[] = [];

    if (!checks.has_requirement_body) {
      missing.push("requirement_body");
    }
    if (checks.has_related_wiki_pages) {
      nextActions.push("fetch_related_wiki_pages");
    }
    if (checks.has_external_links) {
      nextActions.push("review_external_links");
    }
    if (checks.has_rich_resources) {
      nextActions.push("persist_or_review_rich_resources");
    }
    nextActions.push("fetch_task_messages_if_needed");

    return {
      ...checks,
      missing,
      next_actions: nextActions,
    };
  }

  private extractUrls(text: string): string[] {
    const urls = new Set<string>();
    for (const match of text.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
      const rawUrl = this.decodeHtmlEntities(match[0] ?? "").replace(/[),.;，。；]+$/g, "");
      if (rawUrl) {
        urls.add(rawUrl);
      }
    }
    return Array.from(urls);
  }

  private parseWikiPageUrl(
    rawUrl: string,
    fallbackTeamId: string | null,
  ): { teamId: string | null; pageId: string } | null {
    try {
      const url = new URL(rawUrl);
      const text = `${url.pathname}${url.hash}${url.search}`;
      const match =
        text.match(/\/team\/([^/?#]+)\/space\/[^/?#]+\/page\/([^/?#&]+)/) ??
        text.match(/\/team\/([^/?#]+)\/page\/([^/?#&]+)/);
      if (!match?.[2]) {
        return null;
      }
      return {
        teamId: decodeURIComponent(match[1] ?? fallbackTeamId ?? ""),
        pageId: decodeURIComponent(match[2]),
      };
    } catch {
      return null;
    }
  }

  private classifyExternalLink(
    url: string,
  ): RequirementExternalLink["kind"] {
    if (/giga\.usaxure\.com|axure/i.test(url)) {
      return "prototype";
    }
    if (/doc\.weixin\.qq\.com/i.test(url)) {
      return "translation_doc";
    }
    return "external";
  }

  private readHtmlAttribute(tag: string, name: string): string | null {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = tag.match(
      new RegExp(`${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
    );
    const value = match?.[1] ?? match?.[2] ?? match?.[3];
    return value ? this.decodeHtmlEntities(value) : null;
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  private async buildDocDetail(
    metaSource: Record<string, unknown>,
    contentSource: Record<string, unknown>,
    fallbackId: string,
    options: GetDocOptions,
  ): Promise<DocDetail> {
    const loaded = await this.loadDocument(metaSource, contentSource, fallbackId);
    return this.buildDocDetailFromLoaded(loaded, options);
  }

  private async buildDocDetailFromLoaded(
    loaded: LoadedDocument,
    options: GetDocOptions,
  ): Promise<DocDetail> {
    const resources = options.includeResources
      ? await this.enrichResourcesWithOcr(loaded.parsed.resources)
      : undefined;
    const renderDoc: ParsedDocument = {
      children: loaded.parsed.children,
      resources: loaded.parsed.resources,
    };

    const detail: DocDetail = {
      doc: loaded.doc,
    };

    if (options.view === "llm" || options.view === "both") {
      detail.llm_view = {
        type: "document",
        source_format: loaded.doc.source_format,
        children: loaded.parsed.children,
        ...(resources ? { resources } : {}),
      };
    }

    if (options.view === "human" || options.view === "both") {
      detail.human_view = {
        format: "markdown",
        content: renderMarkdown(renderDoc),
      };
    }

    if (options.includeRaw) {
      detail.raw = {
        content: loaded.raw,
      };
    }

    return detail;
  }

  private async loadDoc(docId: string): Promise<LoadedDocument> {
    const authHeaders = await this.sessions.getValidAuthHeaders();
    const template = await this.discovery.resolveDocTemplate(docId, authHeaders);
    const path = template.replace("{docId}", encodeURIComponent(docId));
    const data = await this.requestJson<Record<string, unknown>>(path, { method: "GET" });
    return this.loadDocument(data, data, docId);
  }

  private async loadPageDoc(teamId: string, pageId: string): Promise<LoadedDocument> {
    const infoPath = `/wiki/api/wiki/team/${encodeURIComponent(teamId)}/page/${encodeURIComponent(pageId)}/info`;
    const contentPath = `/wiki/api/wiki/team/${encodeURIComponent(teamId)}/online_page/${encodeURIComponent(pageId)}/content`;
    const infoData = await this.requestJson<Record<string, unknown>>(infoPath, {
      method: "GET",
    });
    const contentData = await this.requestJson<Record<string, unknown>>(contentPath, {
      method: "GET",
    });
    return this.loadDocument(infoData, contentData, pageId);
  }

  private async loadDocByRequirementId(requirementId: string): Promise<LoadedDocument> {
    const authHeaders = await this.sessions.getValidAuthHeaders();
    const reqTemplate = await this.discovery.resolveRequirementTemplate(
      requirementId,
      authHeaders,
    );
    const reqPath = reqTemplate.replace(
      "{requirementId}",
      encodeURIComponent(requirementId),
    );
    const reqData = await this.requestJson<Record<string, unknown>>(reqPath, {
      method: "GET",
    });
    const linkedDocs = this.extractLinkedDocs(reqData);
    if (linkedDocs.length === 0) {
      throw new AppError("NO_LINKED_DOC", "No linked docs found for requirement");
    }

    const latest = linkedDocs.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!latest) {
      throw new AppError("NO_LINKED_DOC", "No linked docs found for requirement");
    }

    return this.loadDoc(latest.id);
  }

  private async loadByParsedRef(parsedRef: ParsedRef): Promise<LoadedDocument> {
    if (parsedRef.kind === "doc") {
      return this.loadDoc(parsedRef.docId);
    }

    if (parsedRef.kind === "page") {
      return this.loadPageDoc(parsedRef.teamId, parsedRef.pageId);
    }

    return this.loadDocByRequirementId(parsedRef.requirementId);
  }

  private async resolveTask(
    ref: string,
    expectedType: WorkItemEntityType,
  ): Promise<ResolveTaskResult> {
    const input = ref.trim();
    const resolutionPath: ResolutionStep[] = [
      { step: "normalize_input", value: input },
    ];
    const taskUrl = this.parseTaskUrl(input);

    if (taskUrl) {
      const taskId =
        taskUrl.taskId ??
        (taskUrl.displayIdPath
          ? await this.resolveTaskIdByDisplayIdPath(
              taskUrl.displayIdPath,
              taskUrl.teamId,
            )
          : null);
      if (!taskId) {
        throw new AppError("INVALID_DOC_REF", "Invalid ONES task ref");
      }

      const raw = await this.loadTaskInfo(taskId, taskUrl.teamId);
      const entity = this.normalizeTaskEntity(raw, expectedType, taskUrl.teamId);
      resolutionPath.push({
        step: taskUrl.taskId ? "parse_task_url" : "resolve_display_id_path",
        value: taskUrl.taskId ?? taskUrl.displayIdPath ?? taskId,
      });
      return {
        input,
        matched: true,
        entity,
        candidates: [],
        resolution_path: resolutionPath,
        raw_payload: raw,
      };
    }

    if (/^[A-Za-z0-9_-]{8,}$/.test(input) && !/^#?\d+$/.test(input)) {
      const raw = await this.loadTaskInfo(input);
      const entity = this.normalizeTaskEntity(raw, expectedType);
      resolutionPath.push({ step: "load_task_by_id", value: input });
      return {
        input,
        matched: true,
        entity,
        candidates: [],
        resolution_path: resolutionPath,
        raw_payload: raw,
      };
    }

    const numberMatch = input.match(/^#?(\d+)$/);
    if (!numberMatch?.[1]) {
      throw new AppError("INVALID_DOC_REF", "Invalid ONES task ref");
    }

    const number = Number(numberMatch[1]);
    const rawSearch = await this.searchTaskByNumber(number);
    const candidates = this.extractTaskSearchItems(rawSearch).map((item) =>
      this.normalizeTaskEntity(item, "task"),
    );
    const entity =
      candidates.find((candidate) => candidate.entity_type === expectedType) ??
      candidates[0] ??
      null;

    resolutionPath.push({
      step: "search_task_by_number_graphql",
      value: String(number),
    });

    return {
      input,
      matched: Boolean(entity),
      entity,
      candidates,
      resolution_path: resolutionPath,
      raw_payload: rawSearch,
    };
  }

  private parseTaskUrl(ref: string): ParsedTaskUrl | null {
    if (!/^https?:\/\//i.test(ref)) {
      return null;
    }

    const url = new URL(ref);
    const text = `${url.pathname}${url.hash}${url.search}`;
    const match = text.match(
      /\/(?:workspace\/)?team\/([^/?#]+)\/(?:[^/?#&]+\/)*task\/([^/?#&]+)/,
    );

    if (match?.[1] && match[2]) {
      return {
        teamId: decodeURIComponent(match[1]),
        taskId: decodeURIComponent(match[2]),
      };
    }

    const issueMatch = text.match(
      /\/(?:workspace\/)?team\/([^/?#]+)\/(?:[^/?#&]+\/)*(?:issue|workitem)\/([^/?#&]+)/,
    );
    if (issueMatch?.[1] && issueMatch[2]) {
      return {
        teamId: decodeURIComponent(issueMatch[1]),
        displayIdPath: decodeURIComponent(issueMatch[2]),
      };
    }

    return null;
  }

  private async searchTaskByNumber(
    number: number,
  ): Promise<Record<string, unknown>> {
    const teamId = this.requireTeamId();
    return this.requestJson<Record<string, unknown>>(
      `/project/api/project/team/${encodeURIComponent(teamId)}/items/graphql?t=group-task-data`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: SEARCH_TASKS_BY_NUMBER_QUERY,
          variables: {
            groupBy: { tasks: {} },
            groupOrderBy: null,
            orderBy: { createTime: "DESC" },
            filterGroup: [{ number_in: [number] }],
            search: null,
            pagination: { limit: 10, preciseCount: false },
            limit: 10,
          },
        }),
      },
    );
  }

  private extractTaskSearchItems(raw: Record<string, unknown>): Record<string, unknown>[] {
    const directItems = this.pickArrayField(raw, [
      "tasks",
      "items",
      "list",
      "related_tasks",
    ]);
    if (directItems.length > 0) {
      return directItems;
    }

    const data = raw.data;
    if (!data || typeof data !== "object") {
      return this.pickArrayField(raw, ["data"]);
    }

    const buckets = this.pickArrayField(data as Record<string, unknown>, ["buckets"]);
    return buckets.flatMap((bucket) => this.pickArrayField(bucket, ["tasks"]));
  }

  private async loadTaskInfo(
    taskId: string,
    teamId?: string,
  ): Promise<Record<string, unknown>> {
    const resolvedTeamId = this.requireTeamId(teamId);
    try {
      return await this.loadOnesProjectTaskInfo(taskId, resolvedTeamId);
    } catch (error) {
      return this.requestJson<Record<string, unknown>>(
        `/project/api/project/team/${encodeURIComponent(resolvedTeamId)}/task/${encodeURIComponent(taskId)}/info`,
        { method: "GET" },
      );
    }
  }

  private async resolveTaskIdByDisplayIdPath(
    displayIdPath: string,
    teamId: string,
  ): Promise<string | null> {
    const data = await this.requestJson<Record<string, unknown>>(
      `/project/api/ones-project/team/${encodeURIComponent(teamId)}/tasks/identifier`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        body: JSON.stringify({ display_id_path: displayIdPath }),
      },
    );

    return this.pickString(data, ["task_uuid", "uuid", "path", "taskId", "task_id"]);
  }

  private async loadOnesProjectTaskInfo(
    taskId: string,
    teamId: string,
  ): Promise<Record<string, unknown>> {
    const data = await this.requestJson<Record<string, unknown>>(
      `/project/api/ones-project/team/${encodeURIComponent(teamId)}/workitems/onesql`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        body: JSON.stringify({
          query: this.buildOnesProjectTaskInfoQuery(taskId),
        }),
      },
    );
    const item = this.extractFirstOnesqlItem(data);
    if (!item) {
      throw new AppError("NOT_FOUND", "ONES resource not found", 404);
    }

    return this.normalizeOnesProjectTaskInfo(item, teamId);
  }

  private buildOnesProjectTaskInfoQuery(taskId: string): string {
    const escapedTaskId = taskId.replace(/'/g, "\\'");
    return [
      "select uid(",
      "field001,field006.uuid,field006.name,field006.icon,field006.isArchive,",
      "field903,field004.uuid,field004.name,field004.email,field004.avatar,",
      "field005.uuid,field005.name,field005.category,",
      "field007.uuid,field007.name,field007.detail_type,",
      "field012.uuid,field012.name,field011.uuid,field011.name,field011.status_category,field011.title,",
      "field016,field031.uuid,field031.name,field029.uuid,field029.name,",
      "LXh61ReU.uuid,LXh61ReU.name,field041.uuid,field041.name,field038.uuid,field038.name,",
      "toDate(field013),field030.uuid,field030.name,field037,field039.uuid,field039.name,",
      "field040.uuid,field040.name,field040.email,field040.avatar,FZtdoCJW,Dz5Goe89,",
      "field007.icon,field007.icon_uuid,field007.built_in,field007.type,",
      "field003.uuid,field003.name,field003.email,field003.avatar,field009,field010,",
      "field008.uuid,field008.name,field008.email,field008.avatar,v$issue_path",
      `) from issue where uid(uuid) = uid('${escapedTaskId}');`,
    ].join("");
  }

  private extractFirstOnesqlItem(data: Record<string, unknown>): Record<string, unknown> | null {
    const rows = this.pickArrayField(data, ["data", "items", "list"]);
    const first = rows[0];
    if (!first) {
      return null;
    }

    const item = first.item;
    if (item && typeof item === "object") {
      return item as Record<string, unknown>;
    }

    return first;
  }

  private normalizeOnesProjectTaskInfo(
    item: Record<string, unknown>,
    teamId: string,
  ): Record<string, unknown> {
    const issueType = this.normalizeOnesProjectFieldRef(item.field007);
    const status = this.normalizeOnesProjectFieldRef(item.field005);
    const assignee = this.normalizeOnesProjectUser(item.field004);
    const owner = this.normalizeOnesProjectUser(item.field003);
    const project = this.normalizeOnesProjectFieldRef(item.field006);
    const issuePath = this.pickArrayField(item, ["v$issue_path"]);
    const firstPath = issuePath[0] ?? {};
    const taskId =
      this.pickString(item, ["uuid"]) ??
      this.pickString(firstPath, ["uuid"]) ??
      "";
    const displayId =
      this.pickString(item, ["field903", "display_id_path"]) ??
      this.pickString(firstPath, ["display_id"]);
    const numberRaw =
      firstPath.number ??
      (displayId ? Number(displayId.match(/(\d+)$/)?.[1]) : undefined);

    return {
      uuid: taskId,
      number: typeof numberRaw === "number" ? numberRaw : undefined,
      summary: this.pickString(item, ["field001"]) ?? this.pickString(firstPath, ["summary"]),
      display_id_path: displayId,
      team_uuid: teamId,
      project,
      issue_type: issueType,
      status,
      owner,
      assign: assignee,
      desc: this.pickString(item, ["field016"]),
      field_values: this.normalizeOnesProjectFieldValues(item),
      raw_onesql_item: item,
    };
  }

  private normalizeOnesProjectFieldValues(item: Record<string, unknown>): CustomField[] {
    return Object.entries(item)
      .filter(([key]) => /^field|^[A-Za-z0-9]{8}$/.test(key))
      .map(([key, value]) => ({
        id: key,
        name: key,
        value,
      }));
  }

  private normalizeOnesProjectFieldRef(raw: unknown): WorkItemRef | null {
    return this.normalizeRef(raw);
  }

  private normalizeOnesProjectUser(raw: unknown): WorkItemUser | null {
    return this.normalizeUser(raw);
  }

  private requireTeamId(teamId?: string): string {
    const resolved = teamId?.trim() || this.cfg.defaultTeamId?.trim();
    if (!resolved) {
      throw new AppError(
        "CONFIG_ERROR",
        "ONES_TEAM_ID is required for work-item tools when the task URL does not include a team id",
      );
    }
    return resolved;
  }

  private normalizeTaskEntity(
    raw: Record<string, unknown>,
    fallbackType: WorkItemEntityType,
    fallbackTeamId?: string,
  ): WorkItemEntity {
    const taskId = this.pickString(raw, [
      "uuid",
      "task_uuid",
      "taskId",
      "task_id",
      "id",
      "key",
    ]);
    const numberRaw = raw.number ?? raw.issue_number ?? raw.task_number;
    const number =
      typeof numberRaw === "number"
        ? numberRaw
        : typeof numberRaw === "string" && numberRaw.trim()
          ? Number(numberRaw)
          : null;
    const teamId =
      this.pickString(raw, ["team_uuid", "team_id", "teamId"]) ??
      fallbackTeamId ??
      this.cfg.defaultTeamId ??
      null;
    const summary = this.pickString(raw, ["summary", "name", "title"]) ?? taskId ?? "";
    const taskType = this.normalizeRef(
      raw.issue_type ?? raw.task_type ?? raw.type ?? raw.issueType,
    );

    const updatedAt = this.pickString(raw, ["updated_at", "updatedAt", "update_time"]);
    return {
      entity_type: this.inferEntityType(taskType, fallbackType),
      task_id: taskId ?? "",
      number: Number.isFinite(number) ? number : null,
      summary,
      task_type: taskType,
      status: this.normalizeRef(raw.status ?? raw.status_info),
      owner: this.normalizeUser(raw.owner ?? raw.owner_info),
      assignee: this.normalizeUser(raw.assign ?? raw.assignee ?? raw.assignee_info),
      team: teamId
        ? {
            id: teamId,
            name: this.pickString(raw, ["team_name", "teamName"]),
          }
        : null,
      parent_task_id:
        this.pickString(raw, ["parent_uuid", "parent_task_id", "parentTaskId"]) ??
        this.pickString(
          raw.parent && typeof raw.parent === "object"
            ? (raw.parent as Record<string, unknown>)
            : {},
          ["uuid", "id", "key"],
        ),
      url:
        teamId && taskId
          ? `${this.cfg.baseUrl.replace(/\/$/, "")}/project/#/team/${encodeURIComponent(teamId)}/task/${encodeURIComponent(taskId)}`
          : null,
      ...(updatedAt ? { updated_at: updatedAt } : {}),
    };
  }

  private inferEntityType(
    taskType: WorkItemRef | null,
    fallbackType: WorkItemEntityType,
  ): WorkItemEntityType {
    const text = `${taskType?.id ?? ""} ${taskType?.name ?? ""}`.toLowerCase();
    if (/缺陷|bug|defect|2eunajcl/i.test(text)) {
      return "bug";
    }
    if (/需求|requirement|story|15eiafu6/i.test(text)) {
      return "requirement";
    }
    if (/任务|task|execution|q6tbhtvc/i.test(text)) {
      return "execution_task";
    }
    return fallbackType;
  }

  private normalizeRelatedTasks(
    raw: Record<string, unknown>,
    fallbackTeamId?: string,
  ): WorkItemEntity[] {
    return this.pickArrayField(raw, [
      "related_tasks",
      "relatedTasks",
      "tasks",
      "links",
    ]).map((item) => this.normalizeTaskEntity(item, "task", fallbackTeamId));
  }

  private normalizeDescription(raw: Record<string, unknown>): WorkItemDescription {
    const richText =
      raw.rich_text ?? raw.richText ?? raw.description_rich_text ?? raw.desc_rich_text ?? null;
    const html = this.pickString(raw, [
      "html",
      "description_html",
      "desc_html",
      "description",
      "desc",
    ]);
    const plainSource =
      this.pickString(raw, ["plain_text", "plainText", "description_text", "desc_text"]) ??
      html ??
      (typeof richText === "string" ? richText : "");

    return {
      plain_text: normalizeContent(plainSource, this.cfg.maxContentChars),
      html,
      rich_text: richText,
    };
  }

  private normalizeCustomFields(raw: Record<string, unknown>): CustomField[] {
    return this.pickArrayField(raw, [
      "custom_fields",
      "customFields",
      "field_values",
      "fieldValues",
    ]).map((field, index) => ({
      id:
        this.pickString(field, ["uuid", "id", "field_uuid", "fieldId"]) ??
        `field-${index}`,
      name: this.pickString(field, ["name", "field_name", "fieldName"]) ?? "",
      value: field.value ?? field.field_value ?? field.fieldValue ?? null,
    }));
  }

  private normalizeMessages(raw: Record<string, unknown>): TaskMessage[] {
    return this.pickArrayField(raw, [
      "messages",
      "comments",
      "activities",
      "notices",
    ]).map((message, index) => {
      const html = this.pickString(message, ["html", "content_html", "content"]);
      const plainSource =
        this.pickString(message, ["plain_text", "plainText", "text"]) ?? html ?? "";
      return {
        id: this.pickString(message, ["uuid", "id"]) ?? `message-${index}`,
        author: this.normalizeUser(message.author ?? message.user ?? message.creator),
        created_at:
          this.pickString(message, ["created_at", "createdAt", "create_time"]) ?? null,
        plain_text: normalizeContent(plainSource, this.cfg.maxContentChars),
        html,
      };
    });
  }

  private normalizeRef(raw: unknown): WorkItemRef | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const record = raw as Record<string, unknown>;
    const id = this.pickString(record, ["uuid", "id", "key"]);
    if (!id) {
      return null;
    }

    return {
      id,
      name: this.pickString(record, ["name", "label", "summary", "title"]),
    };
  }

  private normalizeUser(raw: unknown): WorkItemUser | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const record = raw as Record<string, unknown>;
    const id = this.pickString(record, [
      "uuid",
      "id",
      "user_uuid",
      "org_user_uuid",
      "key",
    ]);
    if (!id) {
      return null;
    }

    return {
      id,
      name: this.pickString(record, ["name", "user_name", "nickname", "email"]),
    };
  }

  private pickString(
    payload: Record<string, unknown>,
    fieldNames: string[],
  ): string | null {
    for (const name of fieldNames) {
      const value = payload[name];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
    return null;
  }

  private async loadDocument(
    metaSource: Record<string, unknown>,
    contentSource: Record<string, unknown>,
    fallbackId: string,
  ): Promise<LoadedDocument> {
    const source = detectDocumentSource(contentSource);
    const parsed = this.parseDocument(source.raw, source.format);
    const normalizedResources = this.normalizeResourceUrls(metaSource, parsed.resources);
    return {
      doc: {
        id: String(metaSource.id ?? fallbackId),
        title: String(metaSource.title ?? metaSource.name ?? fallbackId),
        updated_at: metaSource.updated_at
          ? String(metaSource.updated_at)
          : metaSource.updatedAt
            ? String(metaSource.updatedAt)
            : undefined,
        source_format: source.format,
      },
      raw: source.raw,
      parsed: {
        children: parsed.children,
        resources: normalizedResources,
      },
    };
  }

  private async buildLlmView(
    sourceFormat: DocMetadata["source_format"],
    parsed: ParsedDocument,
    includeResources: boolean,
  ): Promise<LlmDocumentView> {
    const resources = includeResources
      ? await this.enrichResourcesWithOcr(parsed.resources)
      : undefined;

    return {
      type: "document",
      source_format: sourceFormat,
      children: parsed.children,
      ...(resources ? { resources } : {}),
    };
  }

  private buildOutlineFromLoaded(loaded: LoadedDocument): DocumentOutline {
    return buildDocumentOutline(loaded.doc, loaded.parsed);
  }

  private async buildSectionFromLoaded(
    loaded: LoadedDocument,
    sectionId: string,
    options: GetDocSectionOptions,
  ): Promise<DocumentSectionDetail> {
    const outline = this.buildOutlineFromLoaded(loaded);
    const section = outline.sections.find((item) => item.id === sectionId);
    if (!section) {
      throw new AppError("NOT_FOUND", `Section not found: ${sectionId}`, 404);
    }

    return {
      doc: loaded.doc,
      section,
      content: await this.buildLlmView(
        loaded.doc.source_format,
        getSectionSlice(loaded.parsed, outline, sectionId, options.includeDescendants),
        options.includeResources,
      ),
      truncated: false,
    };
  }

  private async buildChunksFromLoaded(
    loaded: LoadedDocument,
    options: GetDocChunksOptions,
  ): Promise<DocumentChunkResult> {
    const outline = this.buildOutlineFromLoaded(loaded);
    const chunks = buildDocumentChunks(outline, options.maxChars);
    const chunkIndex = parseChunkCursor(options.cursor);
    const chunk = chunks[chunkIndex];
    if (!chunk) {
      throw new AppError("NOT_FOUND", `Chunk not found: ${options.cursor ?? "chunk-0"}`, 404);
    }

    return {
      doc: loaded.doc,
      chunk,
      content: await this.buildLlmView(
        loaded.doc.source_format,
        getChunkSlice(loaded.parsed, chunk),
        options.includeResources,
      ),
      has_more: chunkIndex < chunks.length - 1,
      next_cursor: chunkIndex < chunks.length - 1 ? chunks[chunkIndex + 1]?.cursor ?? null : null,
    };
  }

  private async buildContextFromLoaded(
    loaded: LoadedDocument,
    options: GetDocContextOptions,
  ): Promise<DocumentContextResult> {
    const outline = this.buildOutlineFromLoaded(loaded);
    const question = options.question.trim();

    let strategy: DocumentContextStrategy = "outline_only";
    let reason = "fallback_to_outline_only";
    let selectedSections: string[] = [];
    let consumedChunks: number[] = [];
    let truncated = false;
    let parsedContext: ParsedDocument = {
      children: [],
      resources: [],
    };

    const matchedSections = outline.sections.filter((section) => question.includes(section.title));
    const needsFullScan = /整篇|全文|所有|完整|冲突|一致性|全面|全量/.test(question);

    if (needsFullScan) {
      if (outline.estimated_chars <= options.maxChars) {
        strategy = "full_document";
        reason = "question_requires_full_scan_but_document_fits_budget";
        selectedSections = outline.sections.map((section) => section.id);
        parsedContext = loaded.parsed;
      } else {
        const chunks = buildDocumentChunks(outline, options.maxChars);
        const chunk = chunks[0];
        strategy = "full_chunks";
        reason = "question_requires_full_scan";
        if (chunk) {
          selectedSections = chunk.section_ids;
          consumedChunks = [chunk.index];
          parsedContext = getChunkSlice(loaded.parsed, chunk);
          truncated = chunks.length > 1;
        }
      }
    } else if (matchedSections.length > 0) {
      strategy = "targeted_sections";
      reason = "question_matches_section_title";
      selectedSections = matchedSections.map((section) => section.id);
      parsedContext = mergeParsedDocuments(
        matchedSections.map((section) =>
          getSectionSlice(loaded.parsed, outline, section.id, true),
        ),
      );
    } else if (outline.estimated_chars <= options.maxChars) {
      strategy = "full_document";
      reason = "document_fits_budget";
      selectedSections = outline.sections.map((section) => section.id);
      parsedContext = loaded.parsed;
    }

    return {
      doc: loaded.doc,
      strategy,
      reason,
      selected_sections: selectedSections,
      consumed_chunks: consumedChunks,
      truncated,
      context: await this.buildLlmView(
        loaded.doc.source_format,
        parsedContext,
        options.includeResources,
      ),
    };
  }

  private normalizeResourceUrls(
    metaSource: Record<string, unknown>,
    resources: DocumentResource[],
  ): DocumentResource[] {
    const teamId = typeof metaSource.team_uuid === "string" ? metaSource.team_uuid.trim() : "";
    const refUuid = typeof metaSource.ref_uuid === "string" ? metaSource.ref_uuid.trim() : "";
    const baseUrl = this.cfg.baseUrl.replace(/\/$/, "");

    return resources.map((resource) => {
      if (/^https?:\/\//i.test(resource.src)) {
        return resource;
      }

      if (teamId && refUuid) {
        return {
          ...resource,
          src: `${baseUrl}/wiki/api/wiki/editor/${encodeURIComponent(teamId)}/${encodeURIComponent(refUuid)}/resources/${resource.src.replace(/^\/+/, "")}`,
        };
      }

      return resource;
    });
  }

  private parseDocument(raw: string, format: DocDetail["doc"]["source_format"]): ParsedDocument {
    let parsed: ParsedDocument;
    if (format === "html") {
      parsed = parseHtmlDocument(raw);
    } else if (format === "richtext-json") {
      parsed = parseRichTextDocument(raw);
    } else {
      parsed = this.fallbackPlainDocument(raw);
    }

    if (parsed.children.length > 0 || !raw.trim()) {
      return parsed;
    }

    return this.fallbackPlainDocument(raw);
  }

  private fallbackPlainDocument(raw: string): ParsedDocument {
    const content = normalizeContent(raw, this.cfg.maxContentChars);
    if (!content) {
      return {
        children: [],
        resources: [],
      };
    }

    return {
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: content }],
          path: "root/0",
        },
      ],
      resources: [],
    };
  }

  private async enrichResourcesWithOcr(
    resources: DocumentResource[],
  ): Promise<DocumentResource[]> {
    return Promise.all(
      resources.map(async (resource) => {
        if (resource.type !== "image") {
          return resource;
        }

        const ocr = await this.ocrRunner({ id: resource.id, src: resource.src });
        if (ocr.status === "skipped") {
          return resource;
        }

        return {
          ...resource,
          ocr,
        };
      }),
    );
  }

  private extractLinkedDocs(payload: Record<string, unknown>): LinkedDoc[] {
    const linkedDocs = this.pickArrayField(payload, [
      "linked_docs",
      "linkedDocs",
      "documents",
      "docs",
      "linked_documents",
    ]);

    return linkedDocs
      .map((item) => {
        const idRaw = item.id ?? item.doc_id ?? item.docId;
        if (!idRaw) {
          return null;
        }

        const updatedAtRaw =
          item.updated_at ??
          item.updatedAt ??
          item.created_at ??
          item.createdAt ??
          "1970-01-01T00:00:00Z";

        const time = new Date(String(updatedAtRaw)).getTime();

        return {
          id: String(idRaw),
          updatedAt: Number.isFinite(time) ? time : 0,
        };
      })
      .filter((item): item is LinkedDoc => item !== null);
  }

  private pickArrayField(
    payload: Record<string, unknown>,
    fieldNames: string[],
  ): Array<Record<string, unknown>> {
    for (const name of fieldNames) {
      const value = payload[name];
      if (Array.isArray(value)) {
        return value.filter(
          (x): x is Record<string, unknown> => typeof x === "object" && x !== null,
        );
      }
    }
    return [];
  }

  private normalizeDownloadUrl(url: string): string {
    const input = url.trim();
    if (!input) {
      throw new AppError("INVALID_INPUT", "Resource URL is required");
    }

    const base = new URL(this.cfg.baseUrl);
    const normalized = new URL(input, `${base.origin}/`);

    if (normalized.host !== base.host) {
      throw new AppError(
        "INVALID_INPUT",
        "Resource URL must belong to the configured ONES host",
      );
    }

    return normalized.toString();
  }

  private extractFilename(response: Response, url: string): string | null {
    const disposition = response.headers.get("content-disposition");
    const match = disposition?.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
    const encoded = match?.[1] ?? match?.[2] ?? null;
    if (encoded) {
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    }

    const pathname = new URL(url).pathname;
    const lastSegment = pathname.split("/").filter(Boolean).at(-1) ?? "";
    return lastSegment || null;
  }

  private extractResponseSize(response: Response, fallback: number): number {
    const length = response.headers.get("content-length");
    if (!length) {
      return fallback;
    }

    const parsed = Number(length);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  private async requestResponse(
    pathOrUrl: string,
    init: RequestInit,
    retryable = true,
    absolute = false,
  ): Promise<Response> {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const startedAt = Date.now();
    const authHeaders = await this.sessions.getValidAuthHeaders();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    const target = absolute ? pathOrUrl : `${this.cfg.baseUrl}${pathOrUrl}`;

    try {
      const res = await fetch(target, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...authHeaders,
        },
        signal: controller.signal,
      });

      if ([401, 403, 405].includes(res.status)) {
        this.sessions.invalidate();

        if (retryable) {
          return this.requestResponse(pathOrUrl, init, false, absolute);
        }

        throw new AppError("AUTH_FAILED", "ONES authentication failed", res.status);
      }

      if (res.status === 404) {
        throw new AppError("NOT_FOUND", "ONES resource not found", 404);
      }

      if (!res.ok) {
        throw new AppError("UPSTREAM_ERROR", "ONES upstream request failed", res.status);
      }

      logInfo("ones.request", {
        requestId,
        path: absolute ? new URL(target).pathname : pathOrUrl,
        status: res.status,
        durationMs: Date.now() - startedAt,
      });

      return res;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("UPSTREAM_ERROR", "ONES request crashed");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    retryable = true,
  ): Promise<T> {
    const res = await this.requestResponse(path, init, retryable, false);
    return (await res.json()) as T;
  }
}

function mergeParsedDocuments(parts: ParsedDocument[]): ParsedDocument {
  const resources = new Map<string, DocumentResource>();
  const children = parts.flatMap((part) => {
    for (const resource of part.resources) {
      resources.set(resource.id, resource);
    }
    return part.children;
  });

  return {
    children,
    resources: Array.from(resources.values()),
  };
}
