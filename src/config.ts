import "dotenv/config";
import type { OcrConfig } from "./documents/model.js";

export type AppConfig = {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  maxContentChars: number;
  ocr: OcrConfig;
};

function mustGet(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required env: ${key}. Required envs: ONES_BASE_URL, ONES_USERNAME, ONES_PASSWORD`,
    );
  }
  return value;
}

function optionalGet(key: string): string | null {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    return null;
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    baseUrl: mustGet("ONES_BASE_URL"),
    username: mustGet("ONES_USERNAME"),
    password: mustGet("ONES_PASSWORD"),
    timeoutMs: Number(process.env.ONES_TIMEOUT_MS ?? 15000),
    maxContentChars: Number(process.env.ONES_MAX_CONTENT_CHARS ?? 20000),
    ocr: {
      provider: optionalGet("ONES_OCR_PROVIDER"),
      endpoint: optionalGet("ONES_OCR_ENDPOINT"),
      apiKey: optionalGet("ONES_OCR_API_KEY"),
      timeoutMs: Number(process.env.ONES_OCR_TIMEOUT_MS ?? 15000),
    },
  };
}
