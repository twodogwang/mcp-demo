import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { SessionManager } from "../src/auth/session-manager.js";
import { loadConfig } from "../src/config.js";
import type { DocDetail, GetDocView } from "../src/documents/model.js";
import { EndpointDiscovery } from "../src/discovery/endpoint-discovery.js";
import { OnesClient } from "../src/ones-client.js";
import { parseRef } from "../src/ref-parser.js";

export type EvalVariant = "llm_view" | "raw" | "full";

export type EvalArgs = {
  configPath: string;
  variant?: EvalVariant;
  cases: string[];
};

export type EvalCase = {
  name: string;
  ref: string;
  question: string;
  requiredPhrases?: string[];
  forbiddenPhrases?: string[];
  variant?: EvalVariant;
};

export type EvalConfig = {
  model: string;
  variant?: EvalVariant;
  maxOutputTokens?: number;
  developerPrompt?: string;
  refs?: Record<string, string>;
  cases: EvalCase[];
};

export type EvalAnswer = {
  answer: string;
  evidence: string[];
};

export type EvalScore = {
  pass: boolean;
  missingRequired: string[];
  matchedRequired: string[];
  matchedForbidden: string[];
};

type ResponsesPayload = {
  output_text?: unknown;
  output?: unknown[];
};

const DEFAULT_EVAL_CONFIG_PATH = "llm-eval.config.json";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL_PROMPT =
  "你会收到一份 ONES 文档的结构化返回值和一个问题。只依据输入内容回答，不要补充输入中不存在的信息。优先使用表格结构、图片资源和 OCR 信息。";

export function parseEvalArgs(argv: string[]): EvalArgs {
  const args: EvalArgs = {
    configPath: DEFAULT_EVAL_CONFIG_PATH,
    variant: undefined,
    cases: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --config");
      }
      args.configPath = value;
      index += 1;
      continue;
    }

    if (arg === "--variant") {
      const value = argv[index + 1];
      if (!value || !isEvalVariant(value)) {
        throw new Error(`Invalid --variant value: ${value ?? ""}`);
      }
      args.variant = value;
      index += 1;
      continue;
    }

    if (arg === "--case") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --case");
      }
      args.cases.push(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return args;
}

export function resolveEvalRef(
  refOrAlias: string,
  refs: Record<string, string> = {},
): string {
  const trimmed = refOrAlias.trim();
  if (/^https?:\/\//i.test(trimmed) || /^#\d+$/.test(trimmed)) {
    return trimmed;
  }

  const resolved = refs[trimmed];
  if (!resolved) {
    throw new Error(`Unknown eval ref alias: ${trimmed}`);
  }
  return resolved;
}

export function buildEvalInput(detail: DocDetail, variant: EvalVariant): string {
  if (variant === "llm_view") {
    return JSON.stringify(
      {
        doc: detail.doc,
        llm_view: detail.llm_view ?? null,
      },
      null,
      2,
    );
  }

  if (variant === "raw") {
    return JSON.stringify(
      {
        doc: detail.doc,
        raw: detail.raw ?? null,
      },
      null,
      2,
    );
  }

  return JSON.stringify(detail, null, 2);
}

export function scoreEvalResult(
  answer: EvalAnswer,
  evaluator: Pick<EvalCase, "requiredPhrases" | "forbiddenPhrases">,
): EvalScore {
  const corpus = `${answer.answer}\n${answer.evidence.join("\n")}`;
  const required = evaluator.requiredPhrases ?? [];
  const forbidden = evaluator.forbiddenPhrases ?? [];

  const matchedRequired = required.filter((item) => corpus.includes(item));
  const missingRequired = required.filter((item) => !corpus.includes(item));
  const matchedForbidden = forbidden.filter((item) => corpus.includes(item));

  return {
    pass: missingRequired.length === 0 && matchedForbidden.length === 0,
    missingRequired,
    matchedRequired,
    matchedForbidden,
  };
}

export async function loadEvalConfig(
  path = DEFAULT_EVAL_CONFIG_PATH,
): Promise<EvalConfig> {
  const resolvedPath = resolve(process.cwd(), path);
  if (!existsSync(resolvedPath)) {
    throw new Error(`Missing eval config: ${path}`);
  }

  const raw = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${path} must contain a JSON object`);
  }

  const cfg = parsed as EvalConfig;
  if (!cfg.model || !Array.isArray(cfg.cases)) {
    throw new Error(`${path} must define model and cases`);
  }

  return cfg;
}

export async function runEvalLlm(argv: string[]): Promise<string> {
  const args = parseEvalArgs(argv);
  const evalConfig = await loadEvalConfig(args.configPath);
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

  const selectedCases =
    args.cases.length === 0
      ? evalConfig.cases
      : evalConfig.cases.filter((item) => args.cases.includes(item.name));

  if (selectedCases.length === 0) {
    throw new Error("No eval cases selected");
  }

  const results = [];
  for (const item of selectedCases) {
    const variant = item.variant ?? args.variant ?? evalConfig.variant ?? "llm_view";
    const ref = resolveEvalRef(item.ref, evalConfig.refs);
    const detail = await fetchDocDetail(client, cfg.baseUrl, ref, variant);
    const input = buildEvalInput(detail, variant);
    const answer = await queryOpenAi({
      model: evalConfig.model,
      maxOutputTokens: evalConfig.maxOutputTokens ?? 800,
      developerPrompt: evalConfig.developerPrompt ?? DEFAULT_MODEL_PROMPT,
      question: item.question,
      input,
    });
    const score = scoreEvalResult(answer, item);
    results.push({
      name: item.name,
      ref,
      variant,
      question: item.question,
      answer,
      score,
    });
  }

  return formatEvalReport(evalConfig.model, results);
}

async function fetchDocDetail(
  client: OnesClient,
  baseUrl: string,
  ref: string,
  variant: EvalVariant,
): Promise<DocDetail> {
  const parsed = parseRef(ref, new URL(baseUrl).host);
  const view: GetDocView = variant === "full" ? "both" : "llm";
  const includeRaw = variant !== "llm_view";

  if (parsed.kind === "doc") {
    return client.getDoc(parsed.docId, {
      view,
      includeRaw,
      includeResources: true,
    });
  }

  if (parsed.kind === "page") {
    return client.getPageDoc(parsed.teamId, parsed.pageId, {
      view,
      includeRaw,
      includeResources: true,
    });
  }

  return client.getDocByRequirementId(parsed.requirementId, {
    view,
    includeRaw,
    includeResources: true,
  });
}

async function queryOpenAi(input: {
  model: string;
  maxOutputTokens: number;
  developerPrompt: string;
  question: string;
  input: string;
}): Promise<EvalAnswer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required env: OPENAI_API_KEY");
  }

  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL;
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      instructions: input.developerPrompt,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "下面是需要评估的文档输入：",
                input.input,
                "",
                "问题：",
                input.question,
                "",
                '请输出 JSON，字段固定为 {"answer": string, "evidence": string[] }。',
              ].join("\n"),
            },
          ],
        },
      ],
      max_output_tokens: input.maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name: "llm_eval_answer",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["answer", "evidence"],
            properties: {
              answer: { type: "string" },
              evidence: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`openai_http_${response.status}`);
  }

  const payload = (await response.json()) as ResponsesPayload;
  const outputText = readResponseText(payload);
  const parsed = JSON.parse(outputText) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid OpenAI JSON response");
  }

  const answer = parsed as { answer?: unknown; evidence?: unknown };
  return {
    answer: typeof answer.answer === "string" ? answer.answer : "",
    evidence: Array.isArray(answer.evidence)
      ? answer.evidence.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function readResponseText(payload: ResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim() !== "") {
    return payload.output_text;
  }

  const items = Array.isArray(payload.output) ? payload.output : [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = "content" in item ? item.content : [];
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      if ("text" in part && typeof part.text === "string" && part.text.trim() !== "") {
        return part.text;
      }
    }
  }

  throw new Error("OpenAI response text missing");
}

function formatEvalReport(
  model: string,
  results: Array<{
    name: string;
    ref: string;
    variant: EvalVariant;
    question: string;
    answer: EvalAnswer;
    score: EvalScore;
  }>,
): string {
  const passed = results.filter((item) => item.score.pass).length;
  const lines = [
    `model: ${model}`,
    `cases: ${results.length}`,
    `passed: ${passed}`,
    `failed: ${results.length - passed}`,
  ];

  for (const result of results) {
    lines.push("");
    lines.push(`case: ${result.name}`);
    lines.push(`  ref: ${result.ref}`);
    lines.push(`  variant: ${result.variant}`);
    lines.push(`  pass: ${result.score.pass}`);
    lines.push(`  question: ${result.question}`);
    lines.push(`  answer: ${result.answer.answer}`);
    lines.push(`  evidence: ${JSON.stringify(result.answer.evidence)}`);
    lines.push(`  missing_required: ${JSON.stringify(result.score.missingRequired)}`);
    lines.push(`  matched_forbidden: ${JSON.stringify(result.score.matchedForbidden)}`);
  }

  return lines.join("\n");
}

function isEvalVariant(value: string): value is EvalVariant {
  return value === "llm_view" || value === "raw" || value === "full";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEvalLlm(process.argv.slice(2))
    .then((output) => {
      console.log(output);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exit(1);
    });
}
