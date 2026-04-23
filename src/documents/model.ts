export type GetDocView = "llm" | "human" | "both";

export type GetDocInput = {
  view: GetDocView;
  include_raw: boolean;
  include_resources: boolean;
};

export type GetDocOptions = {
  view: GetDocView;
  includeRaw: boolean;
  includeResources: boolean;
};

export function toGetDocOptions(input: GetDocInput): GetDocOptions {
  return {
    view: input.view,
    includeRaw: input.include_raw,
    includeResources: input.include_resources,
  };
}

export type OcrConfig = {
  provider: string | null;
  endpoint: string | null;
  apiKey: string | null;
  timeoutMs: number;
};
