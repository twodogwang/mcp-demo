# ONES Doc MCP

用于内网环境的 ONES 文档读取 MCP Server。只需配置 ONES 地址和登录账号密码，即可通过 MCP 获取文档搜索结果与文档正文。

## 环境要求

- Node.js 20+
- 可访问 ONES 内网地址
- ONES 账号（建议最小只读权限）

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

- `ONES_BASE_URL`：ONES 内网根地址
- `ONES_USERNAME`：登录账号
- `ONES_PASSWORD`：登录密码
- `ONES_TIMEOUT_MS`：请求超时（可选，默认 `15000`）
- `ONES_MAX_CONTENT_CHARS`：正文最大长度（可选，默认 `20000`）

示例中的敏感信息请替换为你自己的值，不要把真实账号密码提交到仓库或直接写进公开文档：

- `ONES_BASE_URL=https://ones.example.internal`
- `ONES_USERNAME=your_username@example.com`
- `ONES_PASSWORD=your_password_here`

## 单独包用法

这个包本质上是一个基于 stdio 的 MCP Server。单独运行时会等待 MCP 客户端连接，不会像普通 CLI 那样输出交互式菜单。

### 直接通过 npm 包运行

直接运行已发布包：

```bash
npx -y @bakarhythm/get-doc-content
```

如果你已经在本地构建，也可以直接运行产物：

```bash
npm install
npm run build
node dist/src/index.js
```

本地开发模式：

```bash
npm install
npm run dev
```

## MCP 用法

### 在 Codex 中使用

`~/.codex/config.toml` 示例：

```toml
[mcp_servers.getDocContent]
type = "stdio"
command = "npx"
args = ["-y", "@bakarhythm/get-doc-content@latest"]

[mcp_servers.getDocContent.env]
ONES_BASE_URL = "https://ones.example.internal"
ONES_USERNAME = "your_username@example.com"
ONES_PASSWORD = "your_password_here"
```

如果你想优先验证本地修复，而不是使用 npm 上的已发布版本，也可以直接指向本地构建产物：

```toml
[mcp_servers.getDocContent]
type = "stdio"
command = "node"
args = ["/absolute/path/to/mcp-demo/dist/src/index.js"]

[mcp_servers.getDocContent.env]
ONES_BASE_URL = "https://ones.example.internal"
ONES_USERNAME = "your_username@example.com"
ONES_PASSWORD = "your_password_here"
```

### 在通用 MCP 客户端中使用

JSON 配置示例：

```json
{
  "mcpServers": {
    "getDocContent": {
      "command": "npx",
      "args": ["-y", "@bakarhythm/get-doc-content"],
      "env": {
        "ONES_BASE_URL": "https://ones.example.internal",
        "ONES_USERNAME": "your_username@example.com",
        "ONES_PASSWORD": "your_password_here"
      }
    }
  }
}
```

启动成功后，MCP 客户端应能看到 `search_docs` 和 `get_doc` 两个工具。

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

2. MCP 启动失败，提示 `initialize response` 或连接被关闭
- 先确认客户端实际启动的是哪个版本。
- 如果你使用的是 `npx -y @bakarhythm/get-doc-content@latest`，请确认已升级到包含最新修复的版本。
- 排查时优先查看 MCP 进程 stderr 日志；当前版本会输出 `mcp.startup.begin`、`mcp.startup.ready`、`mcp.startup.failed`、`mcp.runtime.init.failed` 等结构化日志。

3. 输入无效（`INVALID_DOC_REF`）
- `get_doc.ref` 仅支持完整 URL 或 `#数字`。

4. 无关联文档（`NO_LINKED_DOC`）
- 该需求号下没有关联文档，或当前账号无权限读取。

5. 接口探测失败（`DISCOVERY_FAILED`）
- 说明当前 ONES 实例接口与候选路径不匹配，需要补充候选规则。
