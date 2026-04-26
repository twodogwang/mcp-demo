# @bakarhythm/get-doc-content

## 1.2.0

### Minor Changes

- 369a127: 新增渐进式文档读取能力：`get_doc_outline`、`get_doc_section`、`get_doc_chunks` 和 `get_doc_context`，支持先看结构、再按章节或分块拉取内容，降低长文档一次性截断的概率。

  同时补强了 MCP 工具注册与 `structuredContent` 返回，便于支持结构化结果的客户端直接消费这些新增能力。
