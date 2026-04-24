# LLM View 人工审查模板

用于在**不依赖模型额度**的情况下，人工评估 `get_doc` 返回的 `llm_view` 是否足够支撑后续 LLM 理解、抽取和定位。

## 适用范围

适合审查以下文档类型：

- 纯正文文档
- 简单表格文档
- 复杂表格文档
- 嵌套表格文档
- 带图片文档
- 带 OCR 文档
- `html` 来源页面
- `richtext-json` 来源页面

## 审查目标

每次审查只回答 3 个问题：

1. `llm_view` 是否足够表达原文结构
2. 审查者是否能仅凭 `llm_view` 稳定回答问题
3. 哪些问题必须回退到 `raw` 或 ONES 原页才能确认

## 审查前准备

1. 先在本地准备 ONES 连接配置：`.env`
2. 先在本地准备调试目标：`debug-page.config.json`
3. 用调试脚本抓一份完整输出：

```bash
npm run debug:page -- table-page --full-raw > tmp/debug-page-table-page.txt 2>&1
```

4. 从输出中记录：
   - `doc.title`
   - `doc.source_format`
   - `llm_view.children`
   - `llm_view.resources`
   - `raw.content`

## 每篇文档建议准备的问题

每篇文档建议准备 3 到 5 个问题，其中至少 2 个问题必须依赖结构，而不是只靠纯文本就能回答。

推荐问题类型：

- 表格题：某个表格中的关键字段、规则或约束是什么
- 定位题：某条结论来自哪个 `path`、哪个单元格、哪张图片
- 嵌套关系题：子表属于哪个父模块、父子块的边界是否清晰
- OCR 题：图片 OCR 是否补充了正文中没有的信息
- 冲突题：正文、表格、图片 OCR 之间是否存在信息冲突

不推荐的问题：

- 标题是什么
- 大意是什么
- 文档有没有表格

这类问题过于宽泛，无法检验 `llm_view` 的结构价值。

## 审查步骤

### Step 1. 先独立阅读 `llm_view`

不要先看 ONES 原页，也不要先看 `raw`。

先只看：

- `doc`
- `llm_view.children`
- `llm_view.resources`

回答准备好的问题，并记录：

- 能不能回答
- 是否容易定位
- 是否容易误解

### Step 2. 再查看 `raw`

如果某个问题回答不稳定，再看 `raw.content`，判断问题属于哪类：

- `llm_view` 信息缺失
- `llm_view` 结构存在歧义
- `llm_view` 信息存在，但定位成本过高
- 问题本身设计不合理

### Step 3. 必要时回看 ONES 原页

只有在以下情况才回看 ONES 原页：

- `raw` 也不能帮助确认结构
- 图片展示方式影响理解
- 表格视觉布局对语义有决定性影响

如果必须频繁回看 ONES 原页，通常说明当前 `llm_view` 设计还不够完整。

## 记录维度

每个问题至少记录以下字段：

- `answerable`
- `easy_to_locate`
- `needs_raw`
- `needs_ones_page`
- `issues`

建议评分口径：

- `answerable`
  - `true`: 仅靠 `llm_view` 能稳定回答
  - `false`: 不能稳定回答
- `easy_to_locate`
  - `true`: 可以快速定位到节点、表格或资源
  - `false`: 能答，但定位成本高
- `needs_raw`
  - `true`: 必须借助 `raw` 才能确认
  - `false`: 不需要
- `needs_ones_page`
  - `true`: 必须打开 ONES 原页
  - `false`: 不需要

## 常见问题归类

### 结构缺失

表现：

- 表格被拍平
- 单元格关系看不出来
- 嵌套表格边界不清楚
- 图片与正文关系丢失

### 定位困难

表现：

- `path` 难以人工使用
- 表格节点太大，难以找到具体单元格
- `resourceRef` 与正文上下文关联弱

### 信息歧义

表现：

- 不清楚某条规则属于正文还是表格
- 不清楚 OCR 信息是补充、重复还是冲突
- rich text 块的边界不清楚

### 噪音过多

表现：

- 节点层级过深但信息增益不高
- 审查者需要大量跳转才能拼出结论

## 建议通过标准

如果要认为某类文档的 `llm_view` 可用于后续 LLM 消费，建议满足：

- 关键问题的 `answerable` 至少达到 80%
- 结构型问题中，`easy_to_locate` 至少达到 70%
- `needs_raw` 比例不高于 30%
- `needs_ones_page` 比例尽量接近 0

如果未达到，优先改结构，再谈模型效果。

## 审查记录模板

复制下面的 JSON 模板，为每篇文档单独保存一份记录。

```json
{
  "case": "table-page-1",
  "ref": "table-page",
  "title": "示例页面",
  "source_format": "html",
  "reviewer": "your_name",
  "questions": [
    {
      "question": "第一个表格中的关键规则是什么？",
      "expected_focus": "表格结构",
      "answerable": true,
      "easy_to_locate": false,
      "needs_raw": true,
      "needs_ones_page": false,
      "answer": "支持增量同步，失败后重试 3 次。",
      "evidence": ["root/1", "root/1/r1/c1"],
      "issues": [
        "表格 path 可以看到大致位置，但单元格定位不够直观"
      ]
    }
  ],
  "summary": {
    "overall_usable_for_llm": false,
    "main_risks": [
      "复杂表格定位成本高",
      "OCR 信息和正文关联不够直接"
    ],
    "recommended_actions": [
      "增强表格单元格定位能力",
      "补充 OCR 与节点的关联信息"
    ]
  }
}
```
