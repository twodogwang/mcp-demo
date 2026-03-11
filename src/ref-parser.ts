export type ParsedRef =
  | { kind: "doc"; docId: string }
  | { kind: "page"; teamId: string; pageId: string; spaceId?: string }
  | { kind: "requirement"; requirementId: string };

function extractDocIdFromText(text: string): string | null {
  const docMatch = text.match(/\/doc\/([A-Za-z0-9_-]+)/);
  if (docMatch?.[1]) {
    return docMatch[1];
  }

  const queryIdMatch = text.match(/[?&#](?:docId|doc_id|id)=([A-Za-z0-9_-]+)/i);
  if (queryIdMatch?.[1]) {
    return queryIdMatch[1];
  }

  return null;
}

export function parseRef(ref: string, expectedHost: string): ParsedRef {
  const trimmed = ref.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    if (url.host !== expectedHost) {
      throw new Error("INVALID_DOC_REF");
    }

    const pageMatch =
      `${url.pathname}${url.hash}${url.search}`.match(
        /\/team\/([^/?#]+)\/space\/([^/?#]+)\/page\/([^/?#]+)/,
      ) ??
      `${url.pathname}${url.hash}${url.search}`.match(
        /\/team\/([^/?#]+)\/page\/([^/?#]+)/,
      );

    if (pageMatch) {
      if (pageMatch.length === 4) {
        return {
          kind: "page",
          teamId: pageMatch[1] ?? "",
          spaceId: pageMatch[2] ?? "",
          pageId: pageMatch[3] ?? "",
        };
      }

      return {
        kind: "page",
        teamId: pageMatch[1] ?? "",
        pageId: pageMatch[2] ?? "",
      };
    }

    const docId =
      extractDocIdFromText(`${url.pathname}${url.hash}${url.search}`) ??
      extractDocIdFromText(trimmed);

    if (!docId) {
      throw new Error("INVALID_DOC_REF");
    }

    return { kind: "doc", docId };
  }

  const reqMatch = trimmed.match(/^#(\d+)$/);
  if (reqMatch?.[1]) {
    return { kind: "requirement", requirementId: reqMatch[1] };
  }

  throw new Error("INVALID_DOC_REF");
}
