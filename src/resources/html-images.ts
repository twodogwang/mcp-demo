import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

type HtmlAnyNode = DefaultTreeAdapterMap["node"];
type HtmlElement = DefaultTreeAdapterMap["element"];
type HtmlTextNode = DefaultTreeAdapterMap["textNode"];

export type HtmlImageReference = {
  src: string;
  resource_id: string | null;
  ref_type: string | null;
  ref_id: string | null;
  alt: string | null;
  caption: string | null;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
};

export function readHtmlImageReference(element: HtmlElement): HtmlImageReference | null {
  if (element.tagName.toLowerCase() !== "img") {
    return null;
  }

  const src = (getAttribute(element, "src") ?? "").trim();
  if (!src) {
    return null;
  }

  return {
    src,
    resource_id: readNullableAttribute(element, "data-uuid"),
    ref_type: readNullableAttribute(element, "data-ref-type"),
    ref_id: readNullableAttribute(element, "data-ref-id"),
    alt: readNullableAttribute(element, "alt"),
    caption: readImageCaption(element),
    filename:
      readFirstAttribute(element, ["data-filename", "data-file-name", "data-name"]) ??
      filenameFromUrl(src),
    mime_type: readFirstAttribute(element, ["data-mime", "data-mime-type"]),
    size_bytes: readPositiveIntegerAttribute(element, ["data-size", "data-file-size"]),
    width: readPositiveIntegerAttribute(element, ["width", "data-width"]),
    height: readPositiveIntegerAttribute(element, ["height", "data-height"]),
  };
}

export function extractHtmlImageReferences(raw: string): HtmlImageReference[] {
  const root = parseFragment(raw);
  const resources = new Map<string, HtmlImageReference>();

  const visit = (node: HtmlAnyNode): void => {
    if (isElement(node) && node.tagName.toLowerCase() === "img") {
      const resource = readHtmlImageReference(node);
      if (resource) {
        const key = resource.resource_id ?? resource.src;
        if (!resources.has(key)) {
          resources.set(key, resource);
        }
      }
    }

    if ("childNodes" in node) {
      for (const child of node.childNodes) {
        visit(child);
      }
    }
  };

  for (const child of root.childNodes) {
    visit(child);
  }

  return Array.from(resources.values());
}

function readImageCaption(element: HtmlElement): string | null {
  const explicit = readFirstAttribute(element, ["data-caption", "caption", "title"]);
  if (explicit) {
    return explicit;
  }

  let parent: HtmlElement["parentNode"] = element.parentNode;
  for (let depth = 0; parent && depth < 3; depth += 1) {
    if (isElement(parent)) {
      const parentCaption = readFirstAttribute(parent, ["data-caption", "caption"]);
      if (parentCaption) {
        return parentCaption;
      }
      if (parent.tagName.toLowerCase() === "figure") {
        const figcaption = findDescendantElement(parent, "figcaption");
        const value = figcaption ? normalizeText(readTextContent(figcaption)) : "";
        return value || null;
      }
    }
    parent = "parentNode" in parent ? parent.parentNode : null;
  }

  return null;
}

function findDescendantElement(parent: HtmlElement, tagName: string): HtmlElement | null {
  for (const child of parent.childNodes) {
    if (!isElement(child)) {
      continue;
    }
    if (child.tagName.toLowerCase() === tagName) {
      return child;
    }
    const nested = findDescendantElement(child, tagName);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function readTextContent(node: HtmlAnyNode): string {
  if (isTextNode(node)) {
    return node.value;
  }
  if (!("childNodes" in node)) {
    return "";
  }
  return node.childNodes.map((child) => readTextContent(child)).join("");
}

function readFirstAttribute(element: HtmlElement, names: string[]): string | null {
  for (const name of names) {
    const value = readNullableAttribute(element, name);
    if (value) {
      return value;
    }
  }
  return null;
}

function readNullableAttribute(element: HtmlElement, name: string): string | null {
  const value = getAttribute(element, name)?.trim();
  return value || null;
}

function readPositiveIntegerAttribute(element: HtmlElement, names: string[]): number | null {
  const value = readFirstAttribute(element, names);
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function filenameFromUrl(src: string): string | null {
  try {
    const pathname = new URL(src, "https://ones.invalid/").pathname;
    const segment = pathname.split("/").filter(Boolean).at(-1);
    return segment ? decodeURIComponent(segment) : null;
  } catch {
    return null;
  }
}

function getAttribute(element: HtmlElement, name: string): string | null {
  const attribute = element.attrs.find((item) => item.name.toLowerCase() === name);
  return attribute?.value ?? null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isElement(node: HtmlAnyNode): node is HtmlElement {
  return "tagName" in node;
}

function isTextNode(node: HtmlAnyNode): node is HtmlTextNode {
  return node.nodeName === "#text" && "value" in node;
}
