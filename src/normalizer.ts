export function normalizeContent(raw: string, maxChars = 20000): string {
  const richText = normalizeRichText(raw, maxChars);
  if (richText) {
    return richText;
  }

  const plain = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.slice(0, maxChars).trimEnd();
}

type RichTextBlock = {
  text?: Array<{ insert?: unknown }>;
};

function normalizeRichText(raw: string, maxChars: number): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "";
  }

  if (!parsed || typeof parsed !== "object") {
    return "";
  }

  const blocks = (parsed as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) {
    return "";
  }

  const content = blocks
    .map((block) => extractBlockText(block))
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();

  return content.slice(0, maxChars).trimEnd();
}

function extractBlockText(block: unknown): string {
  if (!block || typeof block !== "object") {
    return "";
  }

  const fragments = ((block as RichTextBlock).text ?? [])
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }

      return typeof item.insert === "string" ? item.insert : "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  return fragments;
}
