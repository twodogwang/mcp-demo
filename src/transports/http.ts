export function createHttpTransportAdapter(): never {
  throw new Error(
    "Streamable HTTP transport is not implemented yet. The server currently starts with stdio only.",
  );
}
