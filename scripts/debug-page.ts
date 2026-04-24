import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { loadConfig } from "../src/config.js";
import { SessionManager } from "../src/auth/session-manager.js";
import { EndpointDiscovery } from "../src/discovery/endpoint-discovery.js";
import { OnesClient } from "../src/ones-client.js";
import { parseRef, type ParsedRef } from "../src/ref-parser.js";
import type { DocDetail, DocumentNode } from "../src/documents/model.js";

export type DebugPageArgs = {
  ref: string;
  rawChars: RawCharLimit;
};

export type DebugPageConfig = {
  defaultRef?: string;
  rawChars?: RawCharLimit;
  refs?: Record<string, string>;
};

type RawCharLimit = number | "all";

const DEFAULT_RAW_CHARS = 1000;
const DEFAULT_DEBUG_CONFIG_PATH = "debug-page.config.json";

export function parseDebugPageArgs(argv: string[]): DebugPageArgs {
  const rawArgs = parseRawArgs(argv);
  if (!rawArgs.ref || rawArgs.ref.trim() === "") {
    throw new Error(
      'Usage: npx tsx scripts/debug-page.ts "<url-or-#requirement|alias>" [--raw-chars 1000|all] [--full-raw]',
    );
  }

  return {
    ref: rawArgs.ref.trim(),
    rawChars: rawArgs.rawChars ?? DEFAULT_RAW_CHARS,
  };
}

export function resolveDebugPageArgs(
  argv: string[],
  config: DebugPageConfig | null,
): DebugPageArgs {
  const rawArgs = parseRawArgs(argv);
  const refOrAlias = rawArgs.ref ?? config?.defaultRef;
  if (!refOrAlias || refOrAlias.trim() === "") {
    throw new Error(
      `Missing debug ref. Pass one on the command line or configure defaultRef in ${DEFAULT_DEBUG_CONFIG_PATH}.`,
    );
  }

  const trimmed = refOrAlias.trim();
  const ref = isDirectRef(trimmed) ? trimmed : config?.refs?.[trimmed];
  if (!ref) {
    throw new Error(`Unknown debug ref alias: ${trimmed}`);
  }

  return {
    ref,
    rawChars: rawArgs.rawChars ?? config?.rawChars ?? DEFAULT_RAW_CHARS,
  };
}

export async function loadDebugPageConfig(
  path = DEFAULT_DEBUG_CONFIG_PATH,
): Promise<DebugPageConfig | null> {
  const resolvedPath = resolve(process.cwd(), path);
  if (!existsSync(resolvedPath)) {
    return null;
  }

  const raw = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${path} must contain a JSON object`);
  }

  return parsed as DebugPageConfig;
}

export function formatDebugReport(
  parsedRef: ParsedRef,
  detail: DocDetail,
  rawChars: RawCharLimit,
): string {
  const topLevelCounts = countTopLevelNodeTypes(detail.llm_view?.children ?? []);
  const resources = detail.llm_view?.resources ?? [];
  const lines = [
    `parsed_ref: ${JSON.stringify(parsedRef, null, 2)}`,
    `doc_id: ${detail.doc.id}`,
    `title: ${detail.doc.title}`,
    `updated_at: ${detail.doc.updated_at ?? ""}`,
    `source_format: ${detail.doc.source_format}`,
    `top_level_node_counts: ${JSON.stringify(topLevelCounts, null, 2)}`,
    `resource_count: ${resources.length}`,
  ];

  for (const [index, resource] of resources.entries()) {
    lines.push(`resource_${index + 1}:`);
    lines.push(`  id: ${resource.id}`);
    lines.push(`  type: ${resource.type}`);
    lines.push(`  src: ${resource.src}`);
    lines.push(`  alt: ${resource.alt ?? ""}`);
    lines.push(`  ocr_status: ${resource.ocr?.status ?? "skipped"}`);
    if (resource.ocr?.status === "failed") {
      lines.push(`  ocr_error: ${resource.ocr.error}`);
    }
  }

  const raw = detail.raw?.content ?? "";
  const previewLength = rawChars === "all" ? raw.length : rawChars;
  const rawPreview = raw.slice(0, previewLength);
  lines.push(`raw_preview_chars: ${Math.min(raw.length, previewLength)}/${raw.length}`);
  lines.push(`raw_preview:\n${rawPreview}${raw.length > previewLength ? "\n...[truncated]" : ""}`);

  return lines.join("\n");
}

function countTopLevelNodeTypes(nodes: DocumentNode[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of nodes) {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
  }
  return counts;
}

export async function runDebugPage(argv: string[]): Promise<string> {
  const args = resolveDebugPageArgs(argv, await loadDebugPageConfig());
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

  const parsedRef = parseRef(args.ref, new URL(cfg.baseUrl).host);
  const detail =
    parsedRef.kind === "doc"
      ? await client.getDoc(parsedRef.docId, {
          view: "llm",
          includeRaw: true,
          includeResources: true,
        })
      : parsedRef.kind === "page"
        ? await client.getPageDoc(parsedRef.teamId, parsedRef.pageId, {
            view: "llm",
            includeRaw: true,
            includeResources: true,
          })
        : await client.getDocByRequirementId(parsedRef.requirementId, {
            view: "llm",
            includeRaw: true,
            includeResources: true,
          });

  return formatDebugReport(parsedRef, detail, args.rawChars);
}

type RawDebugPageArgs = {
  ref?: string;
  rawChars?: RawCharLimit;
};

function parseRawArgs(argv: string[]): RawDebugPageArgs {
  const result: RawDebugPageArgs = {};
  let index = 0;

  if (argv[0] && argv[0] !== "--raw-chars") {
    result.ref = argv[0].trim();
    index = 1;
  }

  for (; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--full-raw") {
      result.rawChars = "all";
      continue;
    }

    if (arg !== "--raw-chars") {
      throw new Error(`Unknown option: ${arg}`);
    }

    result.rawChars = parseRawCharLimit(argv[index + 1]);
    index += 1;
  }

  return result;
}

function isDirectRef(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^#\d+$/.test(value);
}

function parseRawCharLimit(value: string | undefined): RawCharLimit {
  if (!value) {
    throw new Error("Missing value for --raw-chars");
  }

  if (value === "all") {
    return "all";
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid --raw-chars value: ${value}`);
  }

  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDebugPage(process.argv.slice(2))
    .then((output) => {
      console.log(output);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exit(1);
    });
}
