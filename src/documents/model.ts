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

export type DocumentSourceFormat = "html" | "richtext-json" | "plain";

export type OcrBlock = {
  text: string;
  bbox?: number[];
};

export type DocumentResourceOcr =
  | {
      status: "ok";
      text: string;
      blocks: OcrBlock[];
    }
  | { status: "failed"; error: string };

export type InlineNode = {
  type: "text";
  value: string;
};

type BaseDocumentResource = {
  id: string;
  src: string;
  alt: string | null;
};

export type DocumentImageResource = BaseDocumentResource & {
  type: "image";
  ocr?: DocumentResourceOcr;
};

export type DocumentEmbedResource = BaseDocumentResource & {
  type: "embed";
  embedType: string;
};

export type DocumentResource = DocumentImageResource | DocumentEmbedResource;

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

export type LlmDocumentView = {
  type: "document";
  source_format: DocumentSourceFormat;
  children: DocumentNode[];
  resources?: DocumentResource[];
};

export type HumanDocumentView = {
  format: "markdown";
  content: string;
};

export type DocMetadata = {
  id: string;
  title: string;
  updated_at?: string;
  source_format: DocumentSourceFormat;
};

export type RawDocumentView = {
  content: string;
};

export type DocDetail = {
  doc: DocMetadata;
  llm_view?: LlmDocumentView;
  human_view?: HumanDocumentView;
  raw?: RawDocumentView;
};
