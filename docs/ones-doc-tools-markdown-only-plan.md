# ONES doc 工具:Markdown-only 简化方案

> **给执行者**:本文件自包含。改的是 MCP server `@bakarhythm/get-doc-content`,它从 ONES 取 wiki/需求文档。
> **本方案是破坏性重构(major 版本)**,可基于分支 `codex/fix-doc-tools`(已修复表格渲染/降级)继续演进。
>
> **核心判断**:这个 MCP **只服务 LLM**(人类要读文档直接上 ONES 网页)。LLM 最好的输入是 **markdown**,不是结构化 JSON。当前的 `llm_view`(richtext-json) 是基于"LLM 需要 AST 结构"的旧假设设计的,该假设已被实践推翻(richtext-json 太大被截断、skill 实际用的是 markdown、现代 LLM 读 markdown 无障碍)。因此:**移除 llm_view 双视图,markdown 成为唯一内容格式。**

---

## 0. 总原则

1. **TDD**:每个改动先写测试(用真实结构:带编号标题、合并单元格、嵌套表格、图片)→ 红 → 改 → 绿。
2. 这是 **major / 破坏性变更**,要同步更新调用方与文档(见第 5 节)。
3. 每步 `npm test` 全绿、`tsc -p tsconfig.json --noEmit` 通过。

---

## 1. 移除双视图,统一为单一 markdown 输出

**动机**:`llm_view`(richtext-json) 对 LLM 既大又难消费,且唯一"不可替代"的理由(复杂表格保真)已被本方案第 2 节的 markdown 增强消除。全仓除一份评审模板外无业务消费者。

**改动**:
- **`get_doc`**(`src/ones-client.ts:~832`、`src/schemas/get-doc.ts`):
  - 移除 `llm_view` 字段与 `view` 参数。返回结构简化为 `{ doc, content, raw? }`,其中 `content: { format: "markdown", content: string }`(或直接 `content: string`,见下"字段命名")。
- **`get_doc_section` / `get_doc_chunks` / `get_doc_context`**(`src/ones-client.ts:~1504/1532/1567`、对应 schema):
  - 把返回里的 `content: LlmDocumentView` 改成 markdown 字符串;移除 `human_view`、`view` 参数、`shouldIncludeHumanView`。
- **删除**:`src/schemas/document-shared.ts` 的 `llmDocumentViewSchema`(及 `humanDocumentViewSchema` 若不再复用)、`src/documents/model.ts` 的 `LlmDocumentView` / `HumanDocumentView` / `GetDocView` / view 相关 options 字段、`buildLlmView` 方法。
  - 注意:`ParsedDocument`(解析中间产物)**保留**——outline / chunks 切片 / markdown 渲染都依赖它,它不对外暴露,不受影响。
- **字段命名建议**:对外内容字段统一叫 `markdown: string`(最直白),不再用 `llm_view`/`human_view` 这种带误导的名字。

**保留 `raw`**:`get_doc` 的 `raw`(原始 HTML/JSON 文本)作为冷门可选保留(`include_raw=true` 才返回),给"确实要原始数据"的极少数场景留逃生舱。

---

## 2. 增强 `renderMarkdown`,吃下复杂结构(`src/documents/render-markdown.ts`)

> 基于 `codex/fix-doc-tools` 已实现的 `buildTableMatrix`(已正确处理 colspan/rowspan/多段落 cell)继续增强。

**2.1 嵌套表格 → 提升 + 引用** ✅已用 #794 真实嵌套表验证(替换当前"含嵌套表格就整表退化"的逻辑):
- 当 cell 内含子表格时,不再返回 null。改为:给子表分配一个序号 `子表 N`,在主表该 cell 位置渲染引用文本 `[见子表 N]`,并把子表的完整 GFM 表格收集起来,在主表渲染结果**之后**追加输出:
  ```
  | 字段 | 规则 |
  | --- | --- |
  | 退款路径 | [见子表 1] |

  子表 1:
  | 渠道 | 原路退回 |
  | --- | --- |
  | 电汇 | 是 |
  ```
- 子表内可再嵌套 → 递归同样处理。
- **列数不齐时补空对齐,不要整表退化**(合并单元格算出的列数偏差用补空消化,比当前实现更宽容)。
- **rowspan**:下属行该列留空即可;**可选优化**——分类列(如"账号类型")每行重复填充,让每行自包含、LLM 不必回看上一行,图片列仍留空。

> ✅ **验证结论**:已用原型对 #794 sec-57「收款账号动态面板」实测——含 6×2 渠道对照子表、9×3 退款订单子表(内含图片 + 空单元格)、rowspan 9~10、colspan 3、多段落 cell,信息**全部保留**,markdown 体积约 1.5KB(对应 richtext-json 数万字符)。

**2.2 图片 → `![alt](url)` 占位(本期仅占位,图片内容下载单独立项)**:
- 渲染 `![alt](src)`,保留 **alt 语义**(如"电汇账号截图")和 **url 定位**。
- ⚠️ **图片内容当前拿不到,本方案不处理**。实测(#794 资源图):
  - 裸 curl → `HTTP 405`(ONES 拦截外部直连);
  - MCP `download_ones_resource`(带账密会话)→ 仍失败(该 `wiki/api/wiki/editor/.../resources` 端点不认读文档那套认证);
  - OCR 依赖先下载到字节,因此一并卡住。
- 图片**不一定**对应 Figma 设计稿——可能是无设计稿场景下截的原型/标注图,只能靠图本身内容。所以图片下载最终仍需打通,但**列为独立 backlog,不在本方案范围**。
- 打通方向(后续单独做):抓一次浏览器成功加载图片的请求,看它带的 referer/cookie,补 `downloadResource` 的认证上下文;之后再叠加 OCR。

**2.3 真正无法表达的极端结构 → 带定位的占位符**:
- 仅当结构连"提升+引用"都无法表达时,退化为 `[复杂结构,详见原文 <wiki-url>#<path>]`,**必须带可点击的原文定位**(wiki url + 节点 path),让 Agent 能按需用截图/原页兜底。
- 退化要尽量少触发(2.1/2.2 之后应该极少)。

---

## 3. 对抗性测试

- `render-markdown.test.ts`:
  - **嵌套表格**:构造 cell 内含子表,断言输出含主表 + `[见子表 1]` + 追加的子表,且 `not.toContain("[复杂结构")`、`not.toContain("[复杂表格")`。(当前实现遇嵌套表退化 → 红)
  - **图片占位**:构造 image resource,断言 markdown 渲染成 `![alt](url)`(保留 alt)。OCR 本期不做。
  - 保留并更新 colspan/rowspan/多段落用例(来自 `codex/fix-doc-tools`)。
- `ones-client-progressive.test.ts` / `mcp-tools.test.ts` / `mcp-e2e.test.ts`:
  - 改成断言返回 `markdown` 字符串(而非 `content.children` / `human_view`)。
  - 断言响应里**不再有** `llm_view`。
  - `get_doc_context` 的真实问题匹配 + 降级用例(来自 `codex/fix-doc-tools`)保留,断言其 `context` 现在是 markdown。
- 用例数据继续用真实结构(带编号标题、合并表头、嵌套表、图片),不要用玩具数据。

---

## 4. 验收标准

- 移除 `llm_view` / `view` 后,`npm test` 全绿、`tsc` 通过。
- 拿一份含复杂表格(合并 + 嵌套)+ 图片的真实文档(如 #794 sec-57):
  - `get_doc_section` 返回纯 markdown,合并表头/嵌套表/多段落内容**都在**,嵌套表用"提升+引用"表达;图片渲染为 `![alt](url)` 占位(不要求图片内容);
  - 同一章节的 markdown 体积**远小于**旧 richtext-json(实测 ~1.5KB vs 数万字符),不再触发"输出过大转存"。
- 响应中不再出现 richtext-json 结构。

---

## 5. 破坏性变更的收尾(必做)

- 发 **major** 版本(changeset)。
- 更新 `skills/ones-requirement-workflow/SKILL.md` 的 "MCP Contract Expectations"(第 ~386 行):把 `{doc, llm_view, human_view, raw}` 改为 `{doc, markdown, raw?}`。
- 归档/删除 `docs/review/llm-view-manual-review-template.md`(评审对象已移除)。
- 在 `docs/superpowers/plans/2026-04-23-structured-ones-doc-views.md` 顶部加一行说明:llm_view 双视图设计已废弃,原因见本方案。
- README / `.env.example` 若提及 view 参数,一并更新。

---

## 附:为什么这是对的(设计依据)

- **图片**:`llm_view` 和 markdown 一样只有 url,都拿不到图内容 → 砍 llm_view 不损失图片能力。实测图片端点对裸 curl(405)和 MCP download(认证失败)都取不到,故本期仅占位、下载单独立项;且图片未必有 Figma 对应(可能是无设计稿的标注截图),最终仍需打通图片下载。
- **嵌套表格**:`llm_view` 保 JSON 结构,但 LLM 啃深层嵌套 JSON 费劲且会被截断;markdown"提升+引用"对 LLM 更友好且不丢内容。
- **体积/截断**:richtext-json 让长文档膨胀到被截断(#794 实测整篇 303KB、单节 108KB);markdown 小一个数量级,这才解决最初的"长需求被截断"问题。
- **简化**:移除双视图后,`view` 参数、`shouldIncludeHumanView`、`llmViewSchema`、双视图组装逻辑全部消失,工具更小更直白。
