---
"@bakarhythm/get-doc-content": patch
---

Improve ONES authentication requests for enterprise WeChat environments.

- reuse browser-style `Origin`, `Referer`, and `User-Agent` headers in both password-login and external-session modes
- include captured ONES cookies in authenticated document requests
- add env vars for overriding browser headers when ONES routing depends on enterprise WeChat context
