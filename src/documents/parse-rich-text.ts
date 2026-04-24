import type {
  DocumentNode,
  DocumentResource,
  InlineNode,
  ParsedDocument,
  TableCellNode,
  TableRowNode,
} from "./model.js";

type RichTextPayload = {
  blocks?: unknown[];
  [key: string]: unknown;
};

type RichTextTextFragment = {
  insert?: unknown;
};

type RichTextBlock = {
  type?: unknown;
  level?: unknown;
  heading?: unknown;
  ordered?: unknown;
  start?: unknown;
  text?: unknown;
  attrs?: unknown;
  children?: unknown;
  rows?: unknown;
  cols?: unknown;
  embedType?: unknown;
  embedData?: unknown;
};

type RichTextImageAttrs = {
  src?: unknown;
  alt?: unknown;
};

type RichTextEmbedData = {
  src?: unknown;
  thumbnail?: unknown;
};

type ParseState = {
  resources: DocumentResource[];
};

type GridPosition = {
  rowIndex: number;
  colIndex: number;
};

export function parseRichTextDocument(raw: string): ParsedDocument {
  const payload = safeParseRichTextPayload(raw);
  if (!payload || !Array.isArray(payload.blocks)) {
    return emptyDocument();
  }

  const state: ParseState = {
    resources: [],
  };

  return {
    children: parseRichTextBlocks(payload.blocks, "root", payload, state),
    resources: state.resources,
  };
}

function parseRichTextBlocks(
  blocks: unknown[],
  basePath: string,
  payload: RichTextPayload,
  state: ParseState,
): DocumentNode[] {
  const children: DocumentNode[] = [];

  for (const block of blocks) {
    const node = parseRichTextBlock(block, `${basePath}/${children.length}`, payload, state);
    if (!node) {
      continue;
    }
    children.push(node);
  }

  return children;
}

function parseRichTextBlock(
  block: unknown,
  path: string,
  payload: RichTextPayload,
  state: ParseState,
): DocumentNode | null {
  if (!block || typeof block !== "object") {
    return null;
  }

  const typed = block as RichTextBlock;
  const blockType = typeof typed.type === "string" ? typed.type.toLowerCase() : "";

  if (blockType === "heading" || (blockType === "text" && hasHeading(typed.heading))) {
    const children = parseInlineChildren(typed.text);
    if (children.length === 0) {
      return null;
    }

    const levelSource = hasHeading(typed.heading) ? typed.heading : typed.level;
    return {
      type: "heading",
      level: normalizeHeadingLevel(levelSource),
      children,
      path,
    };
  }

  if (blockType === "image") {
    return parseImageBlock(typed.attrs, path, state);
  }

  if (blockType === "embed") {
    return parseEmbedBlock(typed, path, state);
  }

  if (blockType === "table") {
    return parseTableBlock(typed, path, payload, state);
  }

  const children = parseInlineChildren(typed.text);
  if (children.length === 0) {
    return null;
  }

  return {
    type: "paragraph",
    children: addListPrefix(children, typed),
    path,
  };
}

function parseTableBlock(
  block: RichTextBlock,
  path: string,
  payload: RichTextPayload,
  state: ParseState,
): DocumentNode | null {
  const childIds = Array.isArray(block.children)
    ? block.children.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];

  const totalRows = normalizePositiveInt(block.rows, 0);
  const totalCols = normalizePositiveInt(block.cols, 0);
  if (childIds.length === 0 || totalRows < 1 || totalCols < 1) {
    return {
      type: "table",
      rows: [],
      path,
    };
  }

  const occupancy: boolean[][] = Array.from({ length: totalRows }, () =>
    Array.from({ length: totalCols }, () => false),
  );
  const rows: TableRowNode[] = Array.from({ length: totalRows }, () => ({ cells: [] }));

  for (const cellId of childIds) {
    const position = findNextAvailablePosition(occupancy);
    if (!position) {
      break;
    }

    const rowspan = readSpan(block, cellId, "rowSpan");
    const colspan = readSpan(block, cellId, "colSpan");
    markOccupied(occupancy, position, rowspan, colspan);

    const slotBlocks = getSlotBlocks(payload, cellId);
    const cellPath = `${path}/r${position.rowIndex}/c${position.colIndex}`;
    const cell: TableCellNode = {
      colspan,
      rowspan,
      children: parseRichTextBlocks(slotBlocks, cellPath, payload, state),
    };
    rows[position.rowIndex]?.cells.push(cell);
  }

  return {
    type: "table",
    rows: rows.filter((row) => row.cells.length > 0),
    path,
  };
}

function findNextAvailablePosition(occupancy: boolean[][]): GridPosition | null {
  for (let rowIndex = 0; rowIndex < occupancy.length; rowIndex += 1) {
    const row = occupancy[rowIndex] ?? [];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (!row[colIndex]) {
        return { rowIndex, colIndex };
      }
    }
  }

  return null;
}

function markOccupied(
  occupancy: boolean[][],
  position: GridPosition,
  rowspan: number,
  colspan: number,
): void {
  for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
    for (let colOffset = 0; colOffset < colspan; colOffset += 1) {
      const row = occupancy[position.rowIndex + rowOffset];
      if (!row || position.colIndex + colOffset >= row.length) {
        continue;
      }
      row[position.colIndex + colOffset] = true;
    }
  }
}

function readSpan(
  block: RichTextBlock,
  cellId: string,
  name: "colSpan" | "rowSpan",
): number {
  const key = `${cellId}_${name}`;
  return normalizePositiveInt(block[key as keyof RichTextBlock], 1);
}

function getSlotBlocks(payload: RichTextPayload, slotId: string): unknown[] {
  const value = payload[slotId];
  return Array.isArray(value) ? value : [];
}

function parseImageBlock(
  attrs: unknown,
  path: string,
  state: ParseState,
): DocumentNode | null {
  if (!attrs || typeof attrs !== "object") {
    return null;
  }

  const typed = attrs as RichTextImageAttrs;
  const src = typeof typed.src === "string" ? typed.src.trim() : "";
  if (!src) {
    return null;
  }

  const resourceRef = `res-image-${state.resources.length}`;
  state.resources.push({
    id: resourceRef,
    type: "image",
    src,
    alt: typeof typed.alt === "string" ? typed.alt : null,
  });

  return {
    type: "image",
    resourceRef,
    path,
  };
}

function parseEmbedBlock(
  block: RichTextBlock,
  path: string,
  state: ParseState,
): DocumentNode | null {
  const embedType = typeof block.embedType === "string" ? block.embedType.trim() : "";
  const embedData =
    block.embedData && typeof block.embedData === "object"
      ? (block.embedData as RichTextEmbedData)
      : null;

  const src = getEmbedSource(embedData);
  if (!src) {
    return null;
  }

  const resourceRef = `res-image-${state.resources.length}`;
  state.resources.push({
    id: resourceRef,
    type: "embed",
    embedType: embedType || "embed",
    src,
    alt: embedType || null,
  });

  return {
    type: "image",
    resourceRef,
    path,
  };
}

function getEmbedSource(embedData: RichTextEmbedData | null): string {
  if (!embedData) {
    return "";
  }

  if (typeof embedData.src === "string" && embedData.src.trim() !== "") {
    return embedData.src.trim();
  }

  if (typeof embedData.thumbnail === "string" && embedData.thumbnail.trim() !== "") {
    return embedData.thumbnail.trim();
  }

  return "";
}

function parseInlineChildren(text: unknown): InlineNode[] {
  const value = normalizeWhitespace(
    (Array.isArray(text) ? text : [])
      .map((fragment) => readInsertValue(fragment))
      .join(""),
  );

  if (!value) {
    return [];
  }

  return [{ type: "text", value }];
}

function addListPrefix(children: InlineNode[], block: RichTextBlock): InlineNode[] {
  const blockType = typeof block.type === "string" ? block.type.toLowerCase() : "";
  if (blockType !== "list") {
    return children;
  }

  const text = children.map((item) => item.value).join("");
  const prefix =
    block.ordered === true
      ? `${normalizePositiveInt(block.start, 1)}. `
      : "- ";

  return [{ type: "text", value: `${prefix}${text}` }];
}

function readInsertValue(fragment: unknown): string {
  if (!fragment || typeof fragment !== "object") {
    return "";
  }

  const typed = fragment as RichTextTextFragment;
  return typeof typed.insert === "string" ? typed.insert : "";
}

function hasHeading(value: unknown): boolean {
  return typeof value === "number" || typeof value === "string";
}

function normalizeHeadingLevel(level: unknown): number {
  const parsed = typeof level === "number" ? level : Number(level);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.min(6, Math.trunc(parsed)));
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function safeParseRichTextPayload(raw: string): RichTextPayload | null {
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return payload as RichTextPayload;
  } catch {
    return null;
  }
}

function emptyDocument(): ParsedDocument {
  return {
    children: [],
    resources: [],
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
