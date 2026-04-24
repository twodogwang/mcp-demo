export type DocumentSource = {
  raw: string;
  format: "html" | "richtext-json" | "plain";
};

export function detectDocumentSource(payload: Record<string, unknown>): DocumentSource {
  const raw = String(payload.content ?? payload.body ?? "");

  if (looksLikeRichTextJson(raw)) {
    return { raw, format: "richtext-json" };
  }

  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return { raw, format: "html" };
  }

  return { raw, format: "plain" };
}

function looksLikeRichTextJson(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!parsed || typeof parsed !== "object") {
    return false;
  }

  return Array.isArray((parsed as { blocks?: unknown }).blocks);
}
