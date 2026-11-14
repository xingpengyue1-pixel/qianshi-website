# AGENTS.md — 潜势科技官网（纯静态站点）

Codex / Agent 每次改动前请先完整阅读本文件。

## 项目性质
纯静态 HTML 站点，无构建步骤、无后端。样式与交互脚本都写在各 HTML 文件内。入口是根目录的 `index.html`。

## 目录职责
- 根目录 HTML：`index.html`（首页）、`products.html`、`about.html`、`contact.html`
- `insights/`：方法论目录与文章
- `cases/`：案例页面
- `images/`：SVG 插图与 og-cover.png（1200×630）
- `tests/site.test.mjs`：静态检查（HTML 校验、死链、关键元素、SEO）
- `.htmlvalidate.json`：校验规则（已有三条例外）

## 改动规则（可执行）
1. 改页面后必须跑 `npm ci && npm test`（或至少 `npm run validate`），确认全绿再提交。
2. 不得改动金数据 iframe 地址（`https://b6p2zqjy.jsjform.com/f/yt8gjZ`）与联系电话 186 1120 6321，除非明确要求。
3. 保持每个页面有唯一 `h1`、canonical、Open Graph、twitter:card；`sitemap.xml` 要覆盖所有 HTML。
4. 新增页面时同步更新 `sitemap.xml` 与导航。
5. 不要引入新的构建工具或依赖；站点本身依赖为零。

## 禁止事项
- 不要把 `node_modules/` 或测试依赖带入部署文件
- 不要修改已有的例外规则（`.htmlvalidate.json` 中的 no-inline-style 等），除非主动说明
- 不要编造客户案例或数据

## 验收
- `npm test` 通过
- 页面可直接用 `python3 -m http.server 8080` 预览
- 与 README.md 中的联系方式、目录结构不冲突
