import type { OcrConfig } from "../config.js";
import type { DocumentResourceOcr, OcrBlock } from "../documents/model.js";

export type OcrResult =
  | DocumentResourceOcr
  | { status: "skipped"; reason: string };

type OcrImage = {
  id: string;
  src: string;
};

type OcrResponsePayload = {
  text: unknown;
  blocks: unknown;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeBlocks(input: unknown): OcrBlock[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const blocks: OcrBlock[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const text = "text" in item ? item.text : "";
    if (typeof text !== "string") {
      continue;
    }
    const block: OcrBlock = { text };
    if ("bbox" in item && Array.isArray(item.bbox)) {
      const bbox = item.bbox.filter((value: unknown): value is number => typeof value === "number");
      if (bbox.length > 0) {
        block.bbox = bbox;
      }
    }
    blocks.push(block);
  }
  return blocks;
}

async function requestOcr(cfg: OcrConfig, image: OcrImage): Promise<OcrResult> {
  if (cfg.provider !== "http") {
    throw new Error(`unsupported_ocr_provider:${cfg.provider}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const response = await fetch(cfg.endpoint!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        id: image.id,
        src: image.src,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ocr_http_${response.status}`);
    }

    const payload = (await response.json()) as OcrResponsePayload;
    const text = typeof payload.text === "string" ? payload.text : "";
    return {
      status: "ok",
      text,
      blocks: normalizeBlocks(payload.blocks),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function createOcrRunner(cfg: OcrConfig) {
  return async (image: OcrImage): Promise<OcrResult> => {
    if (!cfg.provider || !cfg.endpoint) {
      return { status: "skipped", reason: "ocr_not_configured" };
    }

    try {
      return await requestOcr(cfg, image);
    } catch (error) {
      return { status: "failed", error: toErrorMessage(error) };
    }
  };
}
