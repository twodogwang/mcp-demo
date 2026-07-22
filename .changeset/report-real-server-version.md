---
"@bakarhythm/get-doc-content": patch
---

Report the real npm package version in MCP server info instead of a hardcoded "1.1.1". The version is resolved from the nearest package.json at runtime (works from both src and dist layouts), so MCP clients now display the actual running version.
