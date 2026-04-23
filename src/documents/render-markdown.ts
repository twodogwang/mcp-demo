import type { DocumentNode, ParsedDocument, TableCellNode } from "./model.js";

export function renderMarkdown(doc: ParsedDocument): string {
  return doc.children.map((node) => renderNode(node, doc)).filter(Boolean).join("\n\n");
}

function renderNode(node: DocumentNode, doc: ParsedDocument): string {
  if (node.type === "heading") {
    const level = Math.max(1, Math.min(6, node.level));
    const text = renderInlineText(node.children);
    return `${"#".repeat(level)} ${text}`.trimEnd();
  }

  if (node.type === "paragraph") {
    return renderInlineText(node.children);
  }

  if (node.type === "image") {
    const resource = doc.resources.find((item) => item.id === node.resourceRef);
    if (!resource) {
      return `[图片资源缺失：${node.resourceRef}]`;
    }
    const alt = resource.alt ?? "image";
    return `![${escapeBrackets(alt)}](${resource.src})`;
  }

  return renderTable(node);
}

function renderTable(node: Extract<DocumentNode, { type: "table" }>): string {
  if (node.rows.length === 0) {
    return `[复杂表格，详见原文（${node.path}）]`;
  }

  const matrix = node.rows.map((row) => row.cells.map((cell) => renderSimpleCell(cell)));
  if (matrix.some((row) => row.some((cell) => cell === null))) {
    return `[复杂表格，详见原文（${node.path}）]`;
  }

  const header = matrix[0] ?? [];
  const bodyRows = matrix.slice(1);
  const headerLine = `| ${header.join(" | ")} |`;
  const separatorLine = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = bodyRows.map((row) => `| ${row.join(" | ")} |`);
  return [headerLine, separatorLine, ...bodyLines].join("\n");
}

function renderSimpleCell(cell: TableCellNode): string | null {
  if (cell.colspan !== 1 || cell.rowspan !== 1) {
    return null;
  }

  if (cell.children.length !== 1) {
    return null;
  }

  const node = cell.children[0];
  if (node?.type !== "paragraph") {
    return null;
  }

  return renderInlineText(node.children).replace(/\|/g, "\\|");
}

function renderInlineText(children: Array<{ value: string }>): string {
  return children.map((item) => item.value).join("");
}

function escapeBrackets(value: string): string {
  return value.replace(/\]/g, "\\]");
}
