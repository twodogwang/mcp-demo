import { createHash, publicEncrypt, randomBytes, constants } from "node:crypto";

import type { ExternalSessionConfig } from "../config.js";
import { AppError } from "../errors.js";

type SessionConfig = {
  baseUrl: string;
  username: string | null;
  password: string | null;
  discovery: unknown;
  externalSession: ExternalSessionConfig | null;
};

type OrgUser = {
  org?: {
    org_uuid?: string;
    region_uuid?: string;
  };
  org_user?: {
    org_user_uuid?: string;
    status?: number;
  };
};

type LoginPayload = {
  org_users?: OrgUser[];
};

type TokenPayload = {
  access_token?: string;
};

const DEFAULT_ONES_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 wxwork/5.0.8 WeChat/2.0.4 wwmver/3.26.508.613";

export class SessionManager {
  private authHeaders: Record<string, string> | null = null;
  private inflight: Promise<Record<string, string>> | null = null;
  private cookies = new Map<string, string>();
  private externalSessionExpired = false;

  constructor(private readonly cfg: SessionConfig) {}

  async getValidAuthHeaders(): Promise<Record<string, string>> {
    const externalSession = this.cfg.externalSession;
    if (externalSession?.authToken || externalSession?.cookie) {
      if (this.externalSessionExpired) {
        throw new AppError("AUTH_FAILED", "ONES external session expired", 403);
      }

      if (!this.authHeaders) {
        this.authHeaders = this.buildExternalSessionHeaders(externalSession);
      }

      return this.authHeaders;
    }

    if (this.authHeaders) {
      return this.authHeaders;
    }

    if (!this.inflight) {
      this.inflight = this.login();
    }

    try {
      this.authHeaders = await this.inflight;
      return this.authHeaders;
    } finally {
      this.inflight = null;
    }
  }

  invalidate(): void {
    this.authHeaders = null;
    this.inflight = null;
    this.cookies.clear();
    this.externalSessionExpired = Boolean(
      this.cfg.externalSession?.authToken || this.cfg.externalSession?.cookie,
    );
  }

  private async login(): Promise<Record<string, string>> {
    if (!this.cfg.username || !this.cfg.password) {
      throw new AppError(
        "AUTH_FAILED",
        "ONES username/password missing for identity login",
      );
    }

    const { codeVerifier, codeChallenge } = this.createPkcePair();

    const cert = await this.requestJson<{ public_key?: string }>(
      "/identity/api/encryption_cert",
      {
        method: "POST",
      },
    );

    const encryptedPassword = this.encryptPassword(
      this.cfg.password,
      cert.public_key ?? "",
    );

    const loginPayload = await this.requestJson<LoginPayload>("/identity/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: this.cfg.username,
        password: encryptedPassword,
      }),
    });

    const orgUser = this.pickOrgUser(loginPayload.org_users ?? []);
    const authorizePath = await this.startAuthorizeFlow(orgUser, codeChallenge);
    const authRequestId = this.extractAuthRequestId(authorizePath);

    const finalize = await this.requestJson<{ callback_url?: string }>(
      "/identity/api/auth_request/finalize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_request_id: authRequestId,
          region_uuid: orgUser.org?.region_uuid,
          org_uuid: orgUser.org?.org_uuid,
          org_user_uuid: orgUser.org_user?.org_user_uuid,
        }),
      },
    );

    const redirectLocation = await this.followAuthorizeCallback(
      finalize.callback_url ?? "",
    );
    const code = this.extractQueryParam(redirectLocation, "code");

    const token = await this.requestJson<TokenPayload>("/identity/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "ones.v1",
        code,
        code_verifier: codeVerifier,
        redirect_uri: this.getRedirectUri(),
      }).toString(),
    });

    const accessToken = token.access_token;
    if (!accessToken) {
      throw new AppError("AUTH_FAILED", "ONES oauth token missing");
    }

    const authHeaders = this.buildAuthenticatedHeaders(accessToken);
    await this.requestJson(
      "/project/api/project/auth/token_info",
      {
        method: "GET",
        headers: authHeaders,
      },
      false,
    );

    return this.buildAuthenticatedHeaders(accessToken);
  }

  private buildExternalSessionHeaders(
    externalSession: ExternalSessionConfig,
  ): Record<string, string> {
    const headers = this.buildBrowserHeaders();

    if (externalSession.authToken) {
      headers.Authorization = this.formatAuthorizationHeader(
        externalSession.authToken,
      );
    }

    if (externalSession.cookie) {
      headers.Cookie = externalSession.cookie;
    }

    return headers;
  }

  private formatAuthorizationHeader(token: string): string {
    return /^Bearer\s+/i.test(token) ? token : `Bearer ${token}`;
  }

  private buildAuthenticatedHeaders(accessToken: string): Record<string, string> {
    const headers = this.buildBrowserHeaders();
    headers.Authorization = `Bearer ${accessToken}`;

    const cookie = this.serializeCookies();
    if (cookie) {
      headers.Cookie = cookie;
    }

    return headers;
  }

  private buildBrowserHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const baseUrl = this.cfg.baseUrl.replace(/\/$/, "");
    const externalSession = this.cfg.externalSession;

    headers.Origin = externalSession?.origin ?? baseUrl;
    headers.Referer = externalSession?.referer ?? `${baseUrl}/project/`;
    headers["User-Agent"] =
      externalSession?.userAgent ?? DEFAULT_ONES_USER_AGENT;

    return headers;
  }

  private async startAuthorizeFlow(
    orgUser: OrgUser,
    codeChallenge: string,
  ): Promise<string> {
    const scope = `openid offline_access ones:org:${orgUser.org?.region_uuid}:${orgUser.org?.org_uuid}:${orgUser.org_user?.org_user_uuid}`;
    const state = new URLSearchParams({
      org_uuid: orgUser.org?.org_uuid ?? "",
    }).toString();

    const response = await this.requestRaw("/identity/authorize", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: "ones.v1",
        scope,
        response_type: "code",
        code_challenge_method: "S256",
        code_challenge: codeChallenge,
        redirect_uri: this.getRedirectUri(),
        state,
      }).toString(),
      redirect: "manual",
    });

    const location = response.headers.get("location") ?? response.url;
    if (!location) {
      throw new AppError("AUTH_FAILED", "ONES authorize redirect missing");
    }

    return location;
  }

  private async followAuthorizeCallback(callbackUrl: string): Promise<string> {
    if (!callbackUrl) {
      throw new AppError("AUTH_FAILED", "ONES authorize callback missing");
    }

    const response = await this.requestRaw(this.toAbsoluteUrl(callbackUrl), {
      method: "GET",
      redirect: "manual",
    });

    const location = response.headers.get("location") ?? response.url;
    if (!location) {
      throw new AppError("AUTH_FAILED", "ONES authorize code redirect missing");
    }

    return location;
  }

  private pickOrgUser(orgUsers: OrgUser[]): OrgUser {
    const selected = orgUsers.find(
      (item) =>
        item.org?.org_uuid &&
        item.org?.region_uuid &&
        item.org_user?.org_user_uuid &&
        item.org_user?.status === 1,
    );

    if (!selected) {
      throw new AppError("AUTH_FAILED", "ONES org user missing");
    }

    return selected;
  }

  private createPkcePair(): { codeVerifier: string; codeChallenge: string } {
    const alphabet =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
    const bytes = randomBytes(64);
    const codeVerifier = Array.from(bytes, (byte) => alphabet[byte % alphabet.length])
      .join("")
      .slice(0, 64);

    const codeChallenge = createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");

    return { codeVerifier, codeChallenge };
  }

  private encryptPassword(password: string, publicKey: string): string {
    if (!publicKey) {
      throw new AppError("AUTH_FAILED", "ONES encryption public key missing");
    }

    return publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(password, "utf8"),
    ).toString("base64");
  }

  private extractAuthRequestId(location: string): string {
    return this.extractQueryParam(location, "id");
  }

  private extractQueryParam(input: string, key: string): string {
    const url = new URL(this.toAbsoluteUrl(input));
    const value = url.searchParams.get(key);
    if (!value) {
      throw new AppError("AUTH_FAILED", `ONES redirect missing ${key}`);
    }
    return value;
  }

  private getRedirectUri(): string {
    return `${this.cfg.baseUrl}/auth/authorize/callback`;
  }

  private toAbsoluteUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }

    return `${this.cfg.baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
  }

  private async requestJson<T>(
    pathOrUrl: string,
    init: RequestInit,
    parseJson = true,
  ): Promise<T> {
    const response = await this.requestRaw(pathOrUrl, init);

    if (!response.ok) {
      throw new AppError("AUTH_FAILED", "ONES auth request failed", response.status);
    }

    if (!parseJson) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async requestRaw(pathOrUrl: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers ?? {});
    const cookieHeader = this.serializeCookies();
    if (cookieHeader && !headers.has("Cookie")) {
      headers.set("Cookie", cookieHeader);
    }

    const response = await fetch(this.toAbsoluteUrl(pathOrUrl), {
      ...init,
      headers,
    });

    this.captureCookies(response);

    return response;
  }

  private captureCookies(response: Response): void {
    const setCookie = response.headers.get("set-cookie");
    if (!setCookie) {
      return;
    }

    for (const chunk of this.splitSetCookieHeader(setCookie)) {
      const [pair] = chunk.split(";", 1);
      if (!pair) {
        continue;
      }

      const separator = pair.indexOf("=");
      if (separator <= 0) {
        continue;
      }

      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (!name) {
        continue;
      }

      this.cookies.set(name, value);
    }
  }

  private serializeCookies(): string {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  private splitSetCookieHeader(header: string): string[] {
    return header
      .split(/,(?=\s*[^;,\s]+=)/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
}
