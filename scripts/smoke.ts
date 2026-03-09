export function buildSmokeCommand(query: string): string {
  return JSON.stringify({
    tool: "search_docs",
    arguments: { query, limit: 3 },
  });
}

export function buildGetDocSmokeCommand(ref: string): string {
  return JSON.stringify({
    tool: "get_doc",
    arguments: { ref },
  });
}
