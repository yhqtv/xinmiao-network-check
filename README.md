# 鑫淼网络检测 V1.6 — 网站图标 / 名称 / 网址增强版

本版改成 **一个 Cloudflare Worker 同时托管完整前端静态页面和后端 API**。

GitHub 仍然负责源码托管与版本管理；GitHub Pages 不再需要。

## 最终架构

```text
GitHub
  │
  ├── docs/               前端静态文件
  ├── src/index.js        Worker API
  ├── wrangler.toml
  └── GitHub Actions
        │
        ▼
Cloudflare Worker
  │
  ├── /                   完整 IP 检测网页
  ├── /style.css
  ├── /app.js
  ├── /config.js
  ├── /ip
  ├── /api/ip
  ├── /quality
  ├── /api/quality
  ├── /lookup
  ├── /api/lookup
  └── /health
```

## 正式访问地址

部署完成后直接访问：

`https://xinmiao-network-check.yhqtv.workers.dev/`

现在根地址 `/` 不再返回 JSON，而是直接显示完整 IP 检测网站。

健康检查改到：

`https://xinmiao-network-check.yhqtv.workers.dev/health`

## Cloudflare Static Assets

`wrangler.toml` 已配置：

```toml
[assets]
directory = "./docs"
binding = "ASSETS"
run_worker_first = true
```

Worker 会先处理 API；其他请求自动从 `docs/` 返回前端文件。

## GitHub Pages

V1.5 不需要 GitHub Pages。

你可以保留 GitHub Pages 设置，也可以关闭它；不会影响 Worker 网站。

GitHub 的作用变成：

- 托管全部源码
- 版本管理
- Push 后触发 Cloudflare / GitHub Actions 部署

## IP 质量 Secret

如果需要真实 VPN / Proxy / Tor / Hosting / Abuser 检测，请在 Cloudflare Worker 的 Variables and Secrets 中添加：

`IPAPI_IS_KEY`

不要把 API Key 写入 GitHub。

## D1

当前仍然没有使用 D1：

- D1 Reads = 0
- D1 Writes = 0

## V1.5 变化

- Worker 根地址 `/` 直接显示前端。
- API 和前端同域，不再需要 CORS 跨域连接。
- `docs/config.js` 自动使用 `window.location.origin`。
- 静态文件由 Cloudflare Workers Static Assets 托管。
- `/health` 专门用于后端健康检查。
- Worker 版本升级为 `1.5.0`。


## V1.6

- 各服务检测卡片增加网站 favicon 图标。
- 同时显示网站名称和域名。
- 域名可以点击打开对应官方网站。
- 图标加载失败时自动显示网站名称首字母，不留破图。
- 手机端同步优化卡片布局。
