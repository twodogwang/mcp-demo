import type { DocumentChunkDetail, DocumentOutline, ParsedDocument } from "./model.js";
import { sliceParsedDocumentByRange } from "./outline.js";

export function buildDocumentChunks(
  outline: DocumentOutline,
  maxChars: number,
): DocumentChunkDetail[] {
  if (outline.sections.length === 0) {
    return [];
  }

  const chunks: DocumentChunkDetail[] = [];
  let currentSections: DocumentOutline["sections"] = [];
  let currentChars = 0;

  for (const section of outline.sections) {
    const nextChars = currentChars + section.estimated_chars;
    if (currentSections.length > 0 && nextChars > maxChars) {
      chunks.push(createChunk(chunks.length, currentSections, currentChars));
      currentSections = [section];
      currentChars = section.estimated_chars;
      continue;
    }

    currentSections.push(section);
    currentChars = nextChars;
  }

  if (currentSections.length > 0) {
    chunks.push(createChunk(chunks.length, currentSections, currentChars));
  }

  return chunks;
}

export function parseChunkCursor(cursor: string | null | undefined): number {
  if (!cursor) {
    return 0;
  }

  const match = cursor.match(/^chunk-(\d+)$/);
  if (!match?.[1]) {
    throw new Error(`Invalid chunk cursor: ${cursor}`);
  }

  return Number.parseInt(match[1], 10);
}

export function getChunkSlice(
  parsed: ParsedDocument,
  chunk: DocumentChunkDetail,
): ParsedDocument {
  return sliceParsedDocumentByRange(parsed, chunk.start_index, chunk.end_index);
}

function createChunk(
  index: number,
  sections: DocumentOutline["sections"],
  estimatedChars: number,
): DocumentChunkDetail {
  const first = sections[0];
  const last = sections[sections.length - 1];
  if (!first || !last) {
    throw new Error("Cannot create a chunk without sections");
  }

  return {
    cursor: `chunk-${index}`,
    index,
    section_ids: sections.map((section) => section.id),
    estimated_chars: estimatedChars,
    start_index: first.start_index,
    end_index: last.end_index,
  };
}
