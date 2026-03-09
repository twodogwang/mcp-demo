import "dotenv/config";

export type AppConfig = {
  baseUrl: string;
  username: string;
  password: string;
  timeoutMs: number;
  maxContentChars: number;
};

function mustGet(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env: ${key}`);
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
  };
}
