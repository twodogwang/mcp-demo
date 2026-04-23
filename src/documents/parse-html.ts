import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import type {
  DocumentNode,
  DocumentResource,
  InlineNode,
  ParsedDocument,
  TableCellNode,
  TableRowNode,
} from "./model.js";

type HtmlNode = DefaultTreeAdapterMap["childNode"];
type HtmlElement = DefaultTreeAdapterMap["element"];
type HtmlParent = DefaultTreeAdapterMap["parentNode"];

type ParseState = {
  resources: DocumentResource[];
};

export function parseHtmlDocument(raw: string): ParsedDocument {
  const root = parseFragment(raw);
  const state: ParseState = {
    resources: [],
  };

  return {
    children: parseBlockChildren(root.childNodes, "root", state),
    resources: state.resources,
  };
}

function parseBlockChildren(
  nodes: HtmlNode[],
  basePath: string,
  state: ParseState,
): DocumentNode[] {
  const result: DocumentNode[] = [];

  for (const node of nodes) {
    if (node.nodeName === "#text") {
      const value = normalizeWhitespace(node.value);
      if (!value) {
        continue;
      }

      result.push({
        type: "paragraph",
        children: [{ type: "text", value }],
        path: `${basePath}/${result.length}`,
      });
      continue;
    }

    if (!isElement(node)) {
      continue;
    }

    const tagName = node.tagName.toLowerCase();
    const nextPath = `${basePath}/${result.length}`;

    if (isHeadingTag(tagName)) {
      const children = parseInlineChildren(node);
      if (children.length === 0) {
        continue;
      }

      result.push({
        type: "heading",
        level: Number.parseInt(tagName.slice(1), 10),
        children,
        path: nextPath,
      });
      continue;
    }

    if (tagName === "p") {
      const children = parseInlineChildren(node);
      if (children.length === 0) {
        continue;
      }

      result.push({
        type: "paragraph",
        children,
        path: nextPath,
      });
      continue;
    }

    if (tagName === "table") {
      result.push({
        type: "table",
        rows: parseTableRows(node, nextPath, state),
        path: nextPath,
      });
      continue;
    }

    if (tagName === "img") {
      result.push(parseImageNode(node, nextPath, state));
      continue;
    }

    result.push(...parseBlockChildren(node.childNodes, basePath, state));
  }

  return result;
}

function parseTableRows(table: HtmlElement, tablePath: string, state: ParseState): TableRowNode[] {
  const rows = collectTableRowElements(table);

  return rows.map((row, rowIndex) => {
    const cells = row.childNodes.filter(isElement).filter((cell) => {
      const tagName = cell.tagName.toLowerCase();
      return tagName === "td" || tagName === "th";
    });

    return {
      cells: cells.map((cell, cellIndex) =>
        parseTableCell(cell, `${tablePath}/r${rowIndex}/c${cellIndex}`, state),
      ),
    };
  });
}

function parseTableCell(cell: HtmlElement, cellPath: string, state: ParseState): TableCellNode {
  return {
    colspan: readSpan(cell, "colspan"),
    rowspan: readSpan(cell, "rowspan"),
    children: parseBlockChildren(cell.childNodes, cellPath, state),
  };
}

function parseImageNode(element: HtmlElement, path: string, state: ParseState): DocumentNode {
  const src = getAttribute(element, "src") ?? "";
  const alt = getAttribute(element, "alt");
  const resourceRef = `res-image-${state.resources.length}`;

  state.resources.push({
    id: resourceRef,
    type: "image",
    src,
    alt,
  });

  return {
    type: "image",
    resourceRef,
    path,
  };
}

function parseInlineChildren(parent: HtmlParent): InlineNode[] {
  const value = normalizeWhitespace(readTextContent(parent));
  if (!value) {
    return [];
  }
  return [{ type: "text", value }];
}

function readTextContent(node: HtmlNode | HtmlParent): string {
  if (node.nodeName === "#text") {
    return node.value;
  }

  if (!("childNodes" in node)) {
    return "";
  }

  return node.childNodes.map((child) => readTextContent(child)).join("");
}

function collectTableRowElements(table: HtmlElement): HtmlElement[] {
  const rows: HtmlElement[] = [];

  for (const child of table.childNodes) {
    if (!isElement(child)) {
      continue;
    }

    const tagName = child.tagName.toLowerCase();
    if (tagName === "tr") {
      rows.push(child);
      continue;
    }

    if (tagName === "thead" || tagName === "tbody" || tagName === "tfoot") {
      for (const sectionChild of child.childNodes) {
        if (!isElement(sectionChild) || sectionChild.tagName.toLowerCase() !== "tr") {
          continue;
        }
        rows.push(sectionChild);
      }
    }
  }

  return rows;
}

function readSpan(element: HtmlElement, name: "colspan" | "rowspan"): number {
  const value = getAttribute(element, name);
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function getAttribute(element: HtmlElement, name: string): string | null {
  const attr = element.attrs.find((item) => item.name.toLowerCase() === name);
  return attr?.value ?? null;
}

function isElement(node: HtmlNode): node is HtmlElement {
  return "tagName" in node;
}

function isHeadingTag(tagName: string): boolean {
  return /^h[1-6]$/.test(tagName);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
