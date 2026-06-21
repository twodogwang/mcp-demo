---
"@bakarhythm/get-doc-content": major
---

ONES document tools now return markdown as the only document content format.

Removed the `view` input parameter and the `llm_view` / `human_view` response fields from `get_doc`, `get_doc_section`, `get_doc_chunks`, and `get_doc_context`. Callers should read the top-level `markdown` string instead, with `raw` still available only when explicitly requested.

Fixed `download_ones_resource` for ONES wiki editor image URLs rendered by `get_doc` by reusing the page editor resource token, and now surfaces HTTP 405 as an upstream method error instead of invalidating auth.
