---
"@bakarhythm/get-doc-content": patch
---

Apply browser-style ONES headers during the password login flow.

- send `Origin`, `Referer`, and enterprise-WeChat-like `User-Agent` headers on identity login requests
- preserve the existing cookie-capture flow across authorize and token exchange requests
- unblock ONES tenants that gate account-password login behind browser-context routing
