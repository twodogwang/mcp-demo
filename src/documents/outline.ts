import type {
  DocMetadata,
  DocumentNode,
  DocumentOutline,
  DocumentResource,
  DocumentSectionOutline,
  InlineNode,
  ParsedDocument,
  TableCellNode,
} from "./model.js";

export function buildDocumentOutline(
  doc: DocMetadata,
  parsed: ParsedDocument,
): DocumentOutline {
  const headings = parsed.children
    .map((node, index) => ({ node, index }))
    .filter((entry): entry is { node: Extract<DocumentNode, { type: "heading" }>; index: number } =>
      entry.node.type === "heading",
    );

  const sections: DocumentSectionOutline[] = [];
  let nextId = 1;

  if (headings.length === 0) {
    if (parsed.children.length > 0) {
      sections.push(
        buildSectionOutline(`sec-${nextId}`, "1", doc.title, 0, 0, parsed.children.length, parsed),
      );
    }

    return {
      doc,
      estimated_chars: estimateNodes(parsed.children),
      section_count: sections.length,
      sections,
    };
  }

  const firstHeadingIndex = headings[0]?.index ?? 0;
  if (firstHeadingIndex > 0) {
    sections.push(
      buildSectionOutline(
        `sec-${nextId}`,
        "0",
        doc.title,
        0,
        0,
        firstHeadingIndex,
        parsed,
      ),
    );
    nextId += 1;
  }

  const counters: number[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!heading) {
      continue;
    }

    const nextHeading = headings[index + 1];
    const endIndex = nextHeading?.index ?? parsed.children.length;
    const level = Math.max(1, heading.node.level);
    updateHeadingCounters(counters, level);
    const path = counters.join(".");

    sections.push(
      buildSectionOutline(
        `sec-${nextId}`,
        path,
        readInlineText(heading.node.children) || doc.title,
        level,
        heading.index,
        endIndex,
        parsed,
      ),
    );
    nextId += 1;
  }

  return {
    doc,
    estimated_chars: estimateNodes(parsed.children),
    section_count: sections.length,
    sections,
  };
}

export function getSectionSlice(
  parsed: ParsedDocument,
  outline: DocumentOutline,
  sectionId: string,
  includeDescendants = false,
): ParsedDocument {
  const index = outline.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) {
    return {
      children: [],
      resources: [],
    };
  }

  const section = outline.sections[index];
  if (!section) {
    return {
      children: [],
      resources: [],
    };
  }

  let endIndex = section.end_index;
  if (includeDescendants && section.level > 0) {
    for (let cursor = index + 1; cursor < outline.sections.length; cursor += 1) {
      const next = outline.sections[cursor];
      if (!next || !isDescendantPath(next.path, section.path)) {
        break;
      }
      endIndex = next.end_index;
    }
  }

  return sliceParsedDocumentByRange(parsed, section.start_index, endIndex);
}

export function sliceParsedDocumentByRange(
  parsed: ParsedDocument,
  startIndex: number,
  endIndex: number,
): ParsedDocument {
  const children = parsed.children.slice(startIndex, endIndex);
  const resourceRefs = new Set(children.flatMap((node) => collectResourceRefs(node)));
  const resources = parsed.resources.filter((resource) => resourceRefs.has(resource.id));

  return {
    children,
    resources,
  };
}

function buildSectionOutline(
  id: string,
  path: string,
  title: string,
  level: number,
  startIndex: number,
  endIndex: number,
  parsed: ParsedDocument,
): DocumentSectionOutline {
  const slice = parsed.children.slice(startIndex, endIndex);

  return {
    id,
    path,
    title,
    level,
    estimated_chars: estimateNodes(slice),
    table_count: countNodes(slice, "table"),
    image_count: countNodes(slice, "image"),
    start_index: startIndex,
    end_index: endIndex,
  };
}

function updateHeadingCounters(counters: number[], level: number): void {
  while (counters.length < level) {
    counters.push(0);
  }

  counters.splice(level);
  counters[level - 1] = (counters[level - 1] ?? 0) + 1;
}

function isDescendantPath(path: string, parentPath: string): boolean {
  return path.startsWith(`${parentPath}.`);
}

function countNodes(nodes: DocumentNode[], type: DocumentNode["type"]): number {
  return nodes.reduce((total, node) => total + countNode(node, type), 0);
}

function countNode(node: DocumentNode, type: DocumentNode["type"]): number {
  const selfCount = node.type === type ? 1 : 0;

  if (node.type !== "table") {
    return selfCount;
  }

  return (
    selfCount +
    node.rows.reduce(
      (rowTotal, row) =>
        rowTotal +
        row.cells.reduce(
          (cellTotal, cell) => cellTotal + countCellNodes(cell, type),
          0,
        ),
      0,
    )
  );
}

function countCellNodes(cell: TableCellNode, type: DocumentNode["type"]): number {
  return cell.children.reduce((total, child) => total + countNode(child, type), 0);
}

function estimateNodes(nodes: DocumentNode[]): number {
  return nodes.reduce((total, node) => total + estimateNodeChars(node), 0);
}

function estimateNodeChars(node: DocumentNode): number {
  if (node.type === "heading" || node.type === "paragraph") {
    return readInlineText(node.children).length;
  }

  if (node.type === "image") {
    return 1;
  }

  return node.rows.reduce(
    (rowTotal, row) =>
      rowTotal +
      row.cells.reduce(
        (cellTotal, cell) =>
          cellTotal + cell.children.reduce((childTotal, child) => childTotal + estimateNodeChars(child), 0),
        0,
      ),
    0,
  );
}

function readInlineText(children: InlineNode[]): string {
  return children.map((child) => child.value).join("");
}

function collectResourceRefs(node: DocumentNode): string[] {
  if (node.type === "image") {
    return [node.resourceRef];
  }

  if (node.type !== "table") {
    return [];
  }

  return node.rows.flatMap((row) =>
    row.cells.flatMap((cell) =>
      cell.children.flatMap((child) => collectResourceRefs(child)),
    ),
  );
}
