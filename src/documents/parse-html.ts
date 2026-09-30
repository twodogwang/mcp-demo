import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import type {
  DocumentNode,
  DocumentResource,
  InlineNode,
  ParsedDocument,
  TableCellNode,
  TableRowNode,
} from "./model.js";
import { readHtmlImageReference } from "../resources/html-images.js";

type HtmlNode = DefaultTreeAdapterMap["childNode"];
type HtmlElement = DefaultTreeAdapterMap["element"];
type HtmlParent = DefaultTreeAdapterMap["parentNode"];
type HtmlTextNode = DefaultTreeAdapterMap["textNode"];
type HtmlAnyNode = DefaultTreeAdapterMap["node"];

type ParseState = {
  resources: DocumentResource[];
  resourceRefsByStableId: Map<string, string>;
};

export function parseHtmlDocument(raw: string): ParsedDocument {
  const root = parseFragment(raw);
  const state: ParseState = {
    resources: [],
    resourceRefsByStableId: new Map(),
  };

  return {
    children: parseBlockChildren(root.childNodes, "root", state),
    resources: state.resources,
  };
}

function parseBlockChildren(
  nodes: HtmlAnyNode[],
  basePath: string,
  state: ParseState,
): DocumentNode[] {
  const result: DocumentNode[] = [];

  for (const node of nodes) {
    if (isTextNode(node)) {
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
      if (hasDescendantTag(node, "img")) {
        result.push(...parseBlockChildren(node.childNodes, nextPath, state));
        continue;
      }

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
      const imageNode = parseImageNode(node, nextPath, state);
      if (imageNode) {
        result.push(imageNode);
      }
      continue;
    }

    if (isInlineWrapperElement(node)) {
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

    result.push(...parseBlockChildren(node.childNodes, nextPath, state));
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

function parseImageNode(
  element: HtmlElement,
  path: string,
  state: ParseState,
): DocumentNode | null {
  const image = readHtmlImageReference(element);
  if (!image) {
    return null;
  }

  const existingRef = image.resource_id
    ? state.resourceRefsByStableId.get(image.resource_id)
    : undefined;
  const resourceRef = existingRef ?? `res-image-${state.resources.length}`;

  if (!existingRef) {
    state.resources.push({
      id: resourceRef,
      type: "image",
      src: image.src,
      alt: image.alt,
      ...(image.resource_id ? { resource_id: image.resource_id, original_url: image.src } : {}),
      ...(image.ref_type ? { ref_type: image.ref_type } : {}),
      ...(image.ref_id ? { ref_id: image.ref_id } : {}),
      ...(image.caption ? { caption: image.caption } : {}),
      ...(image.resource_id && image.filename ? { filename: image.filename } : {}),
      ...(image.mime_type ? { mime_type: image.mime_type } : {}),
      ...(image.size_bytes ? { size_bytes: image.size_bytes } : {}),
      ...(image.width ? { width: image.width } : {}),
      ...(image.height ? { height: image.height } : {}),
    });
    if (image.resource_id) {
      state.resourceRefsByStableId.set(image.resource_id, resourceRef);
    }
  }

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

function readTextContent(node: HtmlAnyNode): string {
  if (isTextNode(node)) {
    return node.value;
  }

  if (isElement(node) && node.tagName.toLowerCase() === "br") {
    return "\n";
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

function isElement(node: HtmlAnyNode): node is HtmlElement {
  return "tagName" in node;
}

function isTextNode(node: HtmlAnyNode): node is HtmlTextNode {
  return node.nodeName === "#text" && "value" in node;
}

function isHeadingTag(tagName: string): boolean {
  return /^h[1-6]$/.test(tagName);
}

function isInlineWrapperElement(element: HtmlElement): boolean {
  return !hasBlockDescendant(element);
}

function hasBlockDescendant(parent: HtmlParent): boolean {
  for (const child of parent.childNodes) {
    if (!isElement(child)) {
      continue;
    }

    if (isBlockLikeTag(child.tagName.toLowerCase())) {
      return true;
    }

    if (hasBlockDescendant(child)) {
      return true;
    }
  }

  return false;
}

function hasDescendantTag(parent: HtmlParent, targetTagName: string): boolean {
  for (const child of parent.childNodes) {
    if (!isElement(child)) {
      continue;
    }

    if (child.tagName.toLowerCase() === targetTagName) {
      return true;
    }

    if (hasDescendantTag(child, targetTagName)) {
      return true;
    }
  }

  return false;
}

function isBlockLikeTag(tagName: string): boolean {
  return (
    tagName === "img" ||
    tagName === "table" ||
    tagName === "p" ||
    tagName === "hr" ||
    tagName === "pre" ||
    tagName === "blockquote" ||
    tagName === "ul" ||
    tagName === "ol" ||
    tagName === "li" ||
    tagName === "dl" ||
    tagName === "dt" ||
    tagName === "dd" ||
    tagName === "section" ||
    tagName === "article" ||
    tagName === "aside" ||
    tagName === "nav" ||
    tagName === "main" ||
    tagName === "header" ||
    tagName === "footer" ||
    tagName === "div" ||
    tagName === "figure" ||
    tagName === "figcaption" ||
    tagName === "details" ||
    tagName === "summary" ||
    tagName === "form" ||
    tagName === "fieldset" ||
    tagName === "legend" ||
    tagName === "thead" ||
    tagName === "tbody" ||
    tagName === "tfoot" ||
    tagName === "tr" ||
    tagName === "td" ||
    tagName === "th" ||
    isHeadingTag(tagName)
  );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
