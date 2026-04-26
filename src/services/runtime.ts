import { SessionManager } from "../auth/session-manager.js";
import { loadConfig, type AppConfig } from "../config.js";
import { EndpointDiscovery } from "../discovery/endpoint-discovery.js";
import {
  getRuntimeEnvMeta,
  logError,
  serializeError,
} from "../logger.js";
import { OnesClient } from "../ones-client.js";

export type Runtime = {
  cfg: AppConfig;
  client: OnesClient;
};

export type RuntimeFactory = () => Runtime | Promise<Runtime>;

async function createDefaultRuntime(): Promise<Runtime> {
  try {
    const cfg = loadConfig();
    const discovery = new EndpointDiscovery(cfg.baseUrl, cfg.timeoutMs);

    const sessions = new SessionManager({
      baseUrl: cfg.baseUrl,
      username: cfg.username,
      password: cfg.password,
      discovery,
    });

    const client = new OnesClient(
      {
        baseUrl: cfg.baseUrl,
        timeoutMs: cfg.timeoutMs,
        maxContentChars: cfg.maxContentChars,
        ocr: cfg.ocr,
      },
      sessions,
      discovery,
    );

    return { cfg, client };
  } catch (error) {
    logError("mcp.runtime.init.failed", {
      ...getRuntimeEnvMeta(),
      ...serializeError(error),
    });
    throw error;
  }
}

export function createRuntimeLoader(
  factory: RuntimeFactory = createDefaultRuntime,
): () => Promise<Runtime> {
  let runtimePromise: Promise<Runtime> | null = null;

  return async () => {
    if (!runtimePromise) {
      runtimePromise = Promise.resolve(factory());
    }

    return runtimePromise;
  };
}
