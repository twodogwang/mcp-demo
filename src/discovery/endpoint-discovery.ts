import { AppError } from "../errors.js";
import {
  DOC_PATH_TEMPLATE_CANDIDATES,
  LOGIN_PATH_CANDIDATES,
  REQUIREMENT_PATH_TEMPLATE_CANDIDATES,
  SEARCH_PATH_CANDIDATES,
} from "./candidates.js";

export type ResolvedEndpoints = {
  loginPath: string;
  searchPath: string;
  docPathTemplate?: string;
  requirementPathTemplate?: string;
};

export class EndpointDiscovery {
  private cached: Partial<ResolvedEndpoints> = {};

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async resolveSearchFlow(
    credentials: { username?: string; password?: string } = {},
  ): Promise<ResolvedEndpoints> {
    if (this.cached.loginPath && this.cached.searchPath) {
      return {
        loginPath: this.cached.loginPath,
        searchPath: this.cached.searchPath,
        docPathTemplate: this.cached.docPathTemplate,
        requirementPathTemplate: this.cached.requirementPathTemplate,
      };
    }

    const loginProbe = await this.resolveLoginPath(credentials);
    const searchPath = await this.resolveSearchPath(loginProbe.cookie);

    this.cached = {
      ...this.cached,
      loginPath: loginProbe.path,
      searchPath,
    };

    return {
      loginPath: loginProbe.path,
      searchPath,
      docPathTemplate: this.cached.docPathTemplate,
      requirementPathTemplate: this.cached.requirementPathTemplate,
    };
  }

  async resolveLoginPath(
    credentials: { username?: string; password?: string },
  ): Promise<{ path: string; cookie: string }> {
    if (this.cached.loginPath) {
      return { path: this.cached.loginPath, cookie: "" };
    }

    for (const path of LOGIN_PATH_CANDIDATES) {
      const res = await this.fetchWithTimeout(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: credentials.username ?? "",
          password: credentials.password ?? "",
        }),
      });

      const setCookie = res.headers.get("set-cookie") ?? "";
      const cookie = setCookie.split(";")[0]?.trim() ?? "";

      if (res.ok && cookie) {
        this.cached = {
          ...this.cached,
          loginPath: path,
        };
        return { path, cookie };
      }
    }

    throw new AppError("DISCOVERY_FAILED", "Failed to discover ONES login endpoint");
  }

  async resolveSearchPath(cookie: string): Promise<string> {
    if (this.cached.searchPath) {
      return this.cached.searchPath;
    }

    for (const path of SEARCH_PATH_CANDIDATES) {
      const res = await this.fetchWithTimeout(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
        },
        body: JSON.stringify({ query: "", limit: 1 }),
      });

      if (!res.ok) {
        continue;
      }

      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        continue;
      }

      if (
        payload &&
        typeof payload === "object" &&
        (Array.isArray((payload as Record<string, unknown>).items) ||
          Array.isArray((payload as Record<string, unknown>).list) ||
          Array.isArray((payload as Record<string, unknown>).data))
      ) {
        this.cached = {
          ...this.cached,
          searchPath: path,
        };
        return path;
      }
    }

    throw new AppError("DISCOVERY_FAILED", "Failed to discover ONES search endpoint");
  }

  async resolveDocTemplate(docId: string, cookie: string): Promise<string> {
    if (this.cached.docPathTemplate) {
      return this.cached.docPathTemplate;
    }

    for (const template of DOC_PATH_TEMPLATE_CANDIDATES) {
      const path = template.replace("{docId}", encodeURIComponent(docId));
      const res = await this.fetchWithTimeout(path, {
        method: "GET",
        headers: { Cookie: cookie },
      });

      if (res.status === 401) {
        throw new AppError("AUTH_FAILED", "ONES auth failed while discovering doc path", 401);
      }

      if (res.ok || res.status === 404) {
        this.cached = {
          ...this.cached,
          docPathTemplate: template,
        };
        return template;
      }
    }

    throw new AppError("DISCOVERY_FAILED", "Failed to discover ONES doc endpoint");
  }

  async resolveRequirementTemplate(requirementId: string, cookie: string): Promise<string> {
    if (this.cached.requirementPathTemplate) {
      return this.cached.requirementPathTemplate;
    }

    for (const template of REQUIREMENT_PATH_TEMPLATE_CANDIDATES) {
      const path = template.replace(
        "{requirementId}",
        encodeURIComponent(requirementId),
      );
      const res = await this.fetchWithTimeout(path, {
        method: "GET",
        headers: { Cookie: cookie },
      });

      if (res.status === 401) {
        throw new AppError(
          "AUTH_FAILED",
          "ONES auth failed while discovering requirement path",
          401,
        );
      }

      if (res.ok || res.status === 404) {
        this.cached = {
          ...this.cached,
          requirementPathTemplate: template,
        };
        return template;
      }
    }

    throw new AppError("DISCOVERY_FAILED", "Failed to discover ONES requirement endpoint");
  }

  private async fetchWithTimeout(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
