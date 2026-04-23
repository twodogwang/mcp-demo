# ONES Doc MCP

用于内网环境的 ONES 文档读取 MCP Server。只需配置 ONES 地址和登录账号密码，即可通过 MCP 获取文档搜索结果与文档正文。

## 环境要求

- Node.js 20.19.0+
- 可访问 ONES 内网地址
- ONES 账号（建议最小只读权限）

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

- `ONES_BASE_URL`：ONES 内网根地址
- `ONES_USERNAME`：登录账号
- `ONES_PASSWORD`：登录密码
- `ONES_TIMEOUT_MS`：请求超时（可选，默认 `15000`）
- `ONES_MAX_CONTENT_CHARS`：正文最大长度（可选，默认 `20000`）

## 安装与使用

直接运行：

```bash
npx -y @bakarhythm/get-doc-content
```

MCP 客户端配置示例：

```json
{
  "mcpServers": {
    "ones-doc": {
      "command": "npx",
      "args": ["-y", "@bakarhythm/get-doc-content"],
      "env": {
        "ONES_BASE_URL": "https://ones.example.internal",
        "ONES_USERNAME": "your_username",
        "ONES_PASSWORD": "your_password"
      }
    }
  }
}
```

## MCP 工具

### 1) `search_docs`

按关键词搜索文档。

示例参数：

```json
{"query":"ONES 登录","limit":5}
```

### 2) `get_doc`

通过上下文引用获取文档正文。

`ref` 支持：
- 完整 ONES 文档 URL（优先）
- `#12345` 需求号

当 `ref` 为 `#12345` 时：
- 服务会先查询需求关联文档；
- 按 `updated_at` 取最新一篇（缺失时回退 `created_at`）；
- 返回该文档正文。

示例：

```json
{"ref":"https://ones.example.internal/wiki/#/team/TEAM_ID/space/SPACE_ID/page/PAGE_ID"}
```

```json
{"ref":"#12345"}
```

## 常见问题

1. 登录失败（`AUTH_FAILED`）
- 检查 `ONES_BASE_URL`、账号密码是否正确。

2. 输入无效（`INVALID_DOC_REF`）
- `get_doc.ref` 仅支持完整 URL 或 `#数字`。

3. 无关联文档（`NO_LINKED_DOC`）
- 该需求号下没有关联文档，或当前账号无权限读取。

4. 接口探测失败（`DISCOVERY_FAILED`）
- 说明当前 ONES 实例接口与候选路径不匹配，需要补充候选规则。
