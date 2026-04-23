import type { DocumentNode, DocumentResource, InlineNode, ParsedDocument } from "./model.js";

type RichTextPayload = {
  blocks?: unknown[];
};

type RichTextTextFragment = {
  insert?: unknown;
};

type RichTextBlock = {
  type?: unknown;
  level?: unknown;
  text?: unknown;
  attrs?: unknown;
};

type RichTextImageAttrs = {
  src?: unknown;
  alt?: unknown;
};

type ParseState = {
  resources: DocumentResource[];
};

export function parseRichTextDocument(raw: string): ParsedDocument {
  const payload = safeParseRichTextPayload(raw);
  if (!payload || !Array.isArray(payload.blocks)) {
    return emptyDocument();
  }
  return walkRichTextBlocks(payload.blocks);
}

function walkRichTextBlocks(blocks: unknown[]): ParsedDocument {
  const state: ParseState = {
    resources: [],
  };
  const children: DocumentNode[] = [];

  for (const block of blocks) {
    const node = parseBlock(block, `root/${children.length}`, state);
    if (!node) {
      continue;
    }
    children.push(node);
  }

  return {
    children,
    resources: state.resources,
  };
}

function parseBlock(block: unknown, path: string, state: ParseState): DocumentNode | null {
  if (!block || typeof block !== "object") {
    return null;
  }

  const typed = block as RichTextBlock;
  const blockType = typeof typed.type === "string" ? typed.type.toLowerCase() : "";

  if (blockType === "heading") {
    const children = parseInlineChildren(typed.text);
    if (children.length === 0) {
      return null;
    }
    const level = typeof typed.level === "number" || typeof typed.level === "string" ? typed.level : 1;
    return {
      type: "heading",
      level: normalizeHeadingLevel(level),
      children,
      path,
    };
  }

  if (blockType === "image") {
    return parseImageBlock(typed.attrs, path, state);
  }

  const children = parseInlineChildren(typed.text);
  if (children.length === 0) {
    return null;
  }

  return {
    type: "paragraph",
    children,
    path,
  };
}

function parseImageBlock(attrs: unknown, path: string, state: ParseState): DocumentNode | null {
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

function readInsertValue(fragment: unknown): string {
  if (!fragment || typeof fragment !== "object") {
    return "";
  }

  const typed = fragment as RichTextTextFragment;
  return typeof typed.insert === "string" ? typed.insert : "";
}

function normalizeHeadingLevel(level: number | string): number {
  const parsed = typeof level === "number" ? level : Number(level);
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.min(6, Math.trunc(parsed)));
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
