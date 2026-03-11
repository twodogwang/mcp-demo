export const LOGIN_PATH_CANDIDATES = [
  "/api/login",
  "/api/account/login",
  "/identity/api/login",
  "/account/login",
] as const;

export const SEARCH_PATH_CANDIDATES = [
  "/api/wiki/search",
  "/openapi/wiki/search",
  "/api/docs/search",
] as const;

export const DOC_PATH_TEMPLATE_CANDIDATES = [
  "/api/wiki/docs/{docId}",
  "/openapi/wiki/docs/{docId}",
  "/api/docs/{docId}",
] as const;

export const REQUIREMENT_PATH_TEMPLATE_CANDIDATES = [
  "/api/requirements/{requirementId}",
  "/api/issues/{requirementId}",
  "/openapi/requirements/{requirementId}",
] as const;
