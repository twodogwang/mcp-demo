import "dotenv/config";
import type { OcrConfig } from "./documents/model.js";
export type { OcrConfig } from "./documents/model.js";

export type ExternalSessionConfig = {
  authToken: string | null;
  cookie: string | null;
  origin: string | null;
  referer: string | null;
  userAgent: string | null;
};

export type AppConfig = {
  baseUrl: string;
  username: string | null;
  password: string | null;
  externalSession: ExternalSessionConfig | null;
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
  return value.trim();
}

function optionalGet(key: string): string | null {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    return null;
  }
  return value.trim();
}

function loadExternalSession(): ExternalSessionConfig | null {
  const authToken = optionalGet("ONES_AUTH_TOKEN");
  const cookie = optionalGet("ONES_COOKIE");
  const origin = optionalGet("ONES_ORIGIN");
  const referer = optionalGet("ONES_REFERER");
  const userAgent = optionalGet("ONES_USER_AGENT");

  if (!authToken && !cookie && !origin && !referer && !userAgent) {
    return null;
  }

  return {
    authToken,
    cookie,
    origin,
    referer,
    userAgent,
  };
}

function optionalNumberGet(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric env: ${key}, got: ${value.trim()}`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  const baseUrl = mustGet("ONES_BASE_URL");
  const externalSession = loadExternalSession();
  const username = optionalGet("ONES_USERNAME");
  const password = optionalGet("ONES_PASSWORD");
  const hasExternalAuth = Boolean(
    externalSession?.authToken || externalSession?.cookie,
  );

  if (!hasExternalAuth && (!username || !password)) {
    throw new Error(
      "Missing required env: ONES_USERNAME and ONES_PASSWORD. Required envs: ONES_BASE_URL plus either ONES username/password or ONES_AUTH_TOKEN/ONES_COOKIE",
    );
  }

  return {
    baseUrl,
    username,
    password,
    externalSession,
    timeoutMs: optionalNumberGet("ONES_TIMEOUT_MS", 15000),
    maxContentChars: optionalNumberGet("ONES_MAX_CONTENT_CHARS", 20000),
    ocr: {
      provider: optionalGet("ONES_OCR_PROVIDER"),
      endpoint: optionalGet("ONES_OCR_ENDPOINT"),
      apiKey: optionalGet("ONES_OCR_API_KEY"),
      timeoutMs: optionalNumberGet("ONES_OCR_TIMEOUT_MS", 15000),
    },
  };
}
