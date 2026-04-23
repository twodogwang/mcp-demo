export type GetDocView = "llm" | "human" | "both";

export type GetDocOptionInput = {
  view: GetDocView;
  include_raw: boolean;
  include_resources: boolean;
};

export type GetDocOptions = {
  view: GetDocView;
  includeRaw: boolean;
  includeResources: boolean;
};

export function toGetDocOptions(input: GetDocOptionInput): GetDocOptions {
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

export type InlineNode = {
  type: "text";
  value: string;
};

export type DocumentResource = {
  id: string;
  type: "image";
  src: string;
  alt: string | null;
};

export type TableCellNode = {
  colspan: number;
  rowspan: number;
  children: DocumentNode[];
};

export type TableRowNode = {
  cells: TableCellNode[];
};

export type DocumentNode =
  | { type: "heading"; level: number; children: InlineNode[]; path: string }
  | { type: "paragraph"; children: InlineNode[]; path: string }
  | { type: "table"; rows: TableRowNode[]; path: string }
  | { type: "image"; resourceRef: string; path: string };

export type ParsedDocument = {
  children: DocumentNode[];
  resources: DocumentResource[];
};
