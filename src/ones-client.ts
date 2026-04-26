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

export type SessionProvider = {
  getValidAuthHeaders(): Promise<Record<string, string>>;
  invalidate(): void;
};

export type OnesClientConfig = {
  baseUrl: string;
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

const DEFAULT_GET_DOC_OPTIONS: GetDocOptions = {
  view: "llm",
  includeRaw: false,
  includeResources: true,
};

const DEFAULT_GET_DOC_SECTION_OPTIONS: GetDocSectionOptions = {
  includeDescendants: false,
  includeResources: true,
};

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

  private async requestJson<T>(
    path: string,
    init: RequestInit,
    retryable = true,
  ): Promise<T> {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const startedAt = Date.now();
    const authHeaders = await this.sessions.getValidAuthHeaders();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      const res = await fetch(`${this.cfg.baseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          ...authHeaders,
        },
        signal: controller.signal,
      });

      if (res.status === 401 && retryable) {
        this.sessions.invalidate();
        return this.requestJson<T>(path, init, false);
      }

      if (res.status === 404) {
        throw new AppError("NOT_FOUND", "ONES resource not found", 404);
      }

      if (!res.ok) {
        throw new AppError("UPSTREAM_ERROR", "ONES upstream request failed", res.status);
      }

      logInfo("ones.request", {
        requestId,
        path,
        status: res.status,
        durationMs: Date.now() - startedAt,
      });

      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError("UPSTREAM_ERROR", "ONES request crashed");
    } finally {
      clearTimeout(timeout);
    }
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
