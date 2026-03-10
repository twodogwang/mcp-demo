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

## 本地开发

```bash
npm install
npm run dev
```

## 构建运行

```bash
npm run build
npm run start
```

## 测试

```bash
npm run test
```

## GitHub Actions 发布 npm

仓库已提供工作流：`.github/workflows/publish-npm.yml`。

触发方式：
- 推送语义化版本 tag（如 `v0.1.2`）

发布前准备：
1. 在 npm 包页面启用 Trusted Publishing（OIDC）并添加 GitHub 仓库信任关系：
   - Owner/Repo：`twodogwang/mcp-demo`
   - Workflow file：`.github/workflows/publish-npm.yml`
   - Environment：留空（当前 workflow 未使用 `environment`）
2. 确保 `package.json` 的 `version` 与 tag 一致（例如 `version=0.1.2` 对应 tag `v0.1.2`）。
3. 无需配置 `NPM_TOKEN` Secret。
4. 该 workflow 使用 Node `22.14.0` 以满足 npm Trusted Publishing 的最低版本要求。

推荐发布流程：

```bash
npm run test
npm run build
npm run release:patch   # 或 release:minor / release:major
git push origin main --follow-tags
```

工作流会执行：`npm ci` -> `npm test` -> `npm run build` -> `npm publish --access public --provenance`（通过 GitHub OIDC 获取 npm 发布权限）。

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

## Smoke 命令

```bash
node scripts/smoke.mjs "ONES"
node scripts/smoke.mjs "https://ones.example.internal/wiki/#/doc/abc"
node scripts/smoke.mjs "#12345"
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
