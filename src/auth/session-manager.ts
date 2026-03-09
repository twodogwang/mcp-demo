import { AppError } from "../errors.js";
import type { EndpointDiscovery } from "../discovery/endpoint-discovery.js";

type SessionConfig = {
  baseUrl: string;
  username: string;
  password: string;
  discovery: EndpointDiscovery;
};

export class SessionManager {
  private cookie = "";

  constructor(private readonly cfg: SessionConfig) {}

  async getValidCookie(): Promise<string> {
    if (this.cookie) {
      return this.cookie;
    }

    const login = await this.cfg.discovery.resolveLoginPath({
      username: this.cfg.username,
      password: this.cfg.password,
    });

    const res = await fetch(`${this.cfg.baseUrl}${login.path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: this.cfg.username,
        password: this.cfg.password,
      }),
    });

    if (!res.ok) {
      throw new AppError("AUTH_FAILED", "ONES login failed", res.status);
    }

    const setCookie = res.headers.get("set-cookie") ?? "";
    const firstCookie = setCookie.split(";")[0]?.trim();

    if (!firstCookie) {
      throw new AppError("AUTH_FAILED", "ONES login cookie missing");
    }

    this.cookie = firstCookie;
    return this.cookie;
  }

  invalidate(): void {
    this.cookie = "";
  }
}
