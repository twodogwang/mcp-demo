import type { DocumentNode, ParsedDocument, TableCellNode } from "./model.js";

type RenderContext = {
  nestedTables: string[];
};

export function renderMarkdown(doc: ParsedDocument): string {
  const context: RenderContext = { nestedTables: [] };
  return doc.children.map((node) => renderNode(node, doc, context)).filter(Boolean).join("\n\n");
}

function renderNode(node: DocumentNode, doc: ParsedDocument, context: RenderContext): string {
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

  return renderTable(node, doc, context);
}

function renderTable(
  node: Extract<DocumentNode, { type: "table" }>,
  doc: ParsedDocument,
  context: RenderContext,
): string {
  if (node.rows.length === 0) {
    return `[复杂表格，详见原文（${node.path}）]`;
  }

  const matrix = buildTableMatrix(node, doc, context);
  if (!matrix) {
    return `[复杂表格，详见原文（${node.path}）]`;
  }

  const expectedColumns = Math.max(...matrix.map((row) => row.length));
  if (expectedColumns === 0) {
    return `[复杂表格，详见原文（${node.path}）]`;
  }

  const normalizedMatrix = matrix.map((row) => padRow(row, expectedColumns));
  const header = normalizedMatrix[0] ?? [];
  const bodyRows = normalizedMatrix.slice(1);
  const headerLine = `| ${header.join(" | ")} |`;
  const separatorLine = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = bodyRows.map((row) => `| ${row.join(" | ")} |`);
  const table = [headerLine, separatorLine, ...bodyLines].join("\n");
  if (context.nestedTables.length === 0) {
    return table;
  }

  const nestedTables = context.nestedTables.splice(0);
  return [table, ...nestedTables].join("\n\n");
}

function buildTableMatrix(
  node: Extract<DocumentNode, { type: "table" }>,
  doc: ParsedDocument,
  context: RenderContext,
): string[][] | null {
  const matrix: string[][] = [];
  const activeRowspans: number[] = [];

  for (const row of node.rows) {
    const cells: string[] = [];
    let columnIndex = 0;

    const fillActiveRowspans = () => {
      while ((activeRowspans[columnIndex] ?? 0) > 0) {
        cells[columnIndex] = "";
        activeRowspans[columnIndex] -= 1;
        columnIndex += 1;
      }
    };

    for (const cell of row.cells) {
      fillActiveRowspans();

      const content = renderCellContent(cell, doc, context);
      if (content === null) {
        return null;
      }

      const colspan = Math.max(1, cell.colspan);
      const rowspan = Math.max(1, cell.rowspan);
      for (let offset = 0; offset < colspan; offset += 1) {
        const targetColumn = columnIndex + offset;
        cells[targetColumn] = offset === 0 ? content : "";
        if (rowspan > 1) {
          activeRowspans[targetColumn] = Math.max(activeRowspans[targetColumn] ?? 0, rowspan - 1);
        }
      }
      columnIndex += colspan;
    }

    fillActiveRowspans();
    matrix.push(cells);
  }

  return matrix;
}

function renderCellContent(cell: TableCellNode, doc: ParsedDocument, context: RenderContext): string | null {
  return cell.children
    .map((node) => {
      if (node.type !== "table") {
        return renderNode(node, doc, context);
      }

      const childContext: RenderContext = { nestedTables: [] };
      const table = renderTable(node, doc, childContext);
      const tableNumber = context.nestedTables.length + 1;
      context.nestedTables.push(`子表 ${tableNumber}:\n${table}`);
      return `[见子表 ${tableNumber}]`;
    })
    .filter(Boolean)
    .join("<br>")
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, "<br>");
}

function padRow(row: string[], columns: number): string[] {
  if (row.length >= columns) {
    return row;
  }

  return [...row, ...Array.from({ length: columns - row.length }, () => "")];
}

function renderInlineText(children: Array<{ value: string }>): string {
  return children.map((item) => item.value).join("");
}

function escapeBrackets(value: string): string {
  return value.replace(/\]/g, "\\]");
}
