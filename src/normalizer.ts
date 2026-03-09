export function normalizeContent(raw: string, maxChars = 20000): string {
  const plain = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return plain.slice(0, maxChars).trimEnd();
}
