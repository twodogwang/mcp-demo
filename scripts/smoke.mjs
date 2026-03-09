export function buildSmokeCommand(query) {
  return JSON.stringify({
    tool: "search_docs",
    arguments: { query, limit: 3 },
  });
}

export function buildGetDocSmokeCommand(ref) {
  return JSON.stringify({
    tool: "get_doc",
    arguments: { ref },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = process.argv[2] ?? "ONES";

  if (input.startsWith("http://") || input.startsWith("https://") || /^#\d+$/.test(input)) {
    console.log(buildGetDocSmokeCommand(input));
  } else {
    console.log(buildSmokeCommand(input));
  }
}
