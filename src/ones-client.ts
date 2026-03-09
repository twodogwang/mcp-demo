import type { EndpointDiscovery } from "./discovery/endpoint-discovery.js";
import { AppError } from "./errors.js";
import { logInfo } from "./logger.js";
import { normalizeContent } from "./normalizer.js";

export type SessionProvider = {
  getValidCookie(): Promise<string>;
  invalidate(): void;
};

export type OnesClientConfig = {
  baseUrl: string;
  timeoutMs: number;
  maxContentChars: number;
};

export type SearchDocItem = {
  id: string;
  title: string;
  updated_at?: string;
};

export type DocDetail = {
  id: string;
  title: string;
  content: string;
  updated_at?: string;
};

type LinkedDoc = {
  id: string;
  updatedAt: number;
};

export class OnesClient {
  constructor(
    private readonly cfg: OnesClientConfig,
    private readonly sessions: SessionProvider,
    private readonly discovery: EndpointDiscovery,
  ) {}

  async searchDocs(query: string, limit: number): Promise<SearchDocItem[]> {
    const cookie = await this.sessions.getValidCookie();
    const searchPath = await this.discovery.resolveSearchPath(cookie);

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

  async getDoc(docId: string): Promise<DocDetail> {
    const cookie = await this.sessions.getValidCookie();
    const template = await this.discovery.resolveDocTemplate(docId, cookie);
    const path = template.replace("{docId}", encodeURIComponent(docId));

    const data = await this.requestJson<Record<string, unknown>>(path, { method: "GET" });

    const content = normalizeContent(
      String(data.content ?? data.body ?? ""),
      this.cfg.maxContentChars,
    );

    return {
      id: String(data.id ?? docId),
      title: String(data.title ?? data.name ?? ""),
      content,
      updated_at: data.updated_at
        ? String(data.updated_at)
        : data.updatedAt
          ? String(data.updatedAt)
          : undefined,
    };
  }

  async getDocByRequirementId(requirementId: string): Promise<DocDetail> {
    const cookie = await this.sessions.getValidCookie();
    const reqTemplate = await this.discovery.resolveRequirementTemplate(
      requirementId,
      cookie,
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

    return this.getDoc(latest.id);
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
    const cookie = await this.sessions.getValidCookie();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);

    try {
      const res = await fetch(`${this.cfg.baseUrl}${path}`, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Cookie: cookie,
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
