export type GetDocView = "llm" | "human" | "both";

export type GetDocOptions = {
  view: GetDocView;
  includeRaw: boolean;
  includeResources: boolean;
};

export type OcrConfig = {
  provider: string | null;
  endpoint: string | null;
  apiKey: string | null;
  timeoutMs: number;
};
