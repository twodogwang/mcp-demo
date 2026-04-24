import type { EndpointDiscovery } from "./discovery/endpoint-discovery.js";
import type {
  DocDetail,
  DocumentResource,
  GetDocOptions,
  ParsedDocument,
} from "./documents/model.js";
import { detectDocumentSource } from "./documents/source.js";
import { AppError } from "./errors.js";
import { logInfo } from "./logger.js";
import { normalizeContent } from "./normalizer.js";
import { parseHtmlDocument } from "./documents/parse-html.js";
import { parseRichTextDocument } from "./documents/parse-rich-text.js";
import { renderMarkdown } from "./documents/render-markdown.js";
import { createOcrRunner } from "./ocr/ocr-client.js";
import type { OcrConfig } from "./config.js";

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

const DEFAULT_GET_DOC_OPTIONS: GetDocOptions = {
  view: "llm",
  includeRaw: false,
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
    const authHeaders = await this.sessions.getValidAuthHeaders();
    const template = await this.discovery.resolveDocTemplate(docId, authHeaders);
    const path = template.replace("{docId}", encodeURIComponent(docId));

    const data = await this.requestJson<Record<string, unknown>>(path, { method: "GET" });
    return this.buildDocDetail(data, data, docId, options);
  }

  async getPageDoc(
    teamId: string,
    pageId: string,
    options: GetDocOptions = DEFAULT_GET_DOC_OPTIONS,
  ): Promise<DocDetail> {
    const infoPath = `/wiki/api/wiki/team/${encodeURIComponent(teamId)}/page/${encodeURIComponent(pageId)}/info`;
    const contentPath = `/wiki/api/wiki/team/${encodeURIComponent(teamId)}/online_page/${encodeURIComponent(pageId)}/content`;

    const infoData = await this.requestJson<Record<string, unknown>>(infoPath, {
      method: "GET",
    });
    const contentData = await this.requestJson<Record<string, unknown>>(contentPath, {
      method: "GET",
    });

    return this.buildDocDetail(infoData, contentData, pageId, options);
  }

  async getDocByRequirementId(
    requirementId: string,
    options: GetDocOptions = DEFAULT_GET_DOC_OPTIONS,
  ): Promise<DocDetail> {
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

    return this.getDoc(latest.id, options);
  }

  private async buildDocDetail(
    metaSource: Record<string, unknown>,
    contentSource: Record<string, unknown>,
    fallbackId: string,
    options: GetDocOptions,
  ): Promise<DocDetail> {
    const source = detectDocumentSource(contentSource);
    const parsed = this.parseDocument(source.raw, source.format);
    const normalizedResources = this.normalizeResourceUrls(metaSource, parsed.resources);
    const resources = options.includeResources
      ? await this.enrichResourcesWithOcr(normalizedResources)
      : undefined;
    const renderDoc: ParsedDocument = {
      children: parsed.children,
      resources: normalizedResources,
    };

    const detail: DocDetail = {
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
    };

    if (options.view === "llm" || options.view === "both") {
      detail.llm_view = {
        type: "document",
        source_format: source.format,
        children: parsed.children,
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
        content: source.raw,
      };
    }

    return detail;
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
