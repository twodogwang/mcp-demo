# @bakarhythm/get-doc-content

## 1.5.0

### Minor Changes

- 87255fc: Add current ONES work-item detail support, authenticated resource downloads, and expanded requirement workflow skill guidance.

### Patch Changes

- f9d7810: Add read-only ONES work-item tools for requirement and bug workflow support.

## 1.4.0

### Minor Changes

- b492cd5: 新增 ONES work-item `*_by_ref` 工具，支持从需求号、bug 号或任务 URL 直接读取需求、缺陷和物料信息，并更新 workflow skill 默认入口。

## 1.3.1

### Patch Changes

- ee6bc9d: 发布 ONES requirement workflow skill 到包内，并补充 skill 校验入口与发布文件清单。

## 1.3.0

### Minor Changes

- d1b3318: 新增 ONES work item 系列工具，支持需求、执行任务、缺陷与需求物料信息提取。

## 1.2.2

### Patch Changes

- ae09e20: Apply browser-style ONES headers during the password login flow.

  - send `Origin`, `Referer`, and enterprise-WeChat-like `User-Agent` headers on identity login requests
  - preserve the existing cookie-capture flow across authorize and token exchange requests
  - unblock ONES tenants that gate account-password login behind browser-context routing

## 1.2.1

### Patch Changes

- 1aa48c0: Improve ONES authentication requests for enterprise WeChat environments.

  - reuse browser-style `Origin`, `Referer`, and `User-Agent` headers in both password-login and external-session modes
  - include captured ONES cookies in authenticated document requests
  - add env vars for overriding browser headers when ONES routing depends on enterprise WeChat context

## 1.2.0

### Minor Changes

- 369a127: 新增渐进式文档读取能力：`get_doc_outline`、`get_doc_section`、`get_doc_chunks` 和 `get_doc_context`，支持先看结构、再按章节或分块拉取内容，降低长文档一次性截断的概率。

  同时补强了 MCP 工具注册与 `structuredContent` 返回，便于支持结构化结果的客户端直接消费这些新增能力。
