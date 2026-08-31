# 鑫淼网络检测 V1.1

架构：**GitHub Pages 托管前端 + Cloudflare Worker 提供 API + GitHub Actions 自动部署 Worker**。

## 目录结构

```text
.
├── docs/                    # GitHub Pages 网站
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── config.js            # 填 Worker 地址
├── worker/                  # Cloudflare Worker API
│   ├── src/index.js
│   ├── package.json
│   └── wrangler.toml
└── .github/workflows/
    └── deploy-worker.yml     # GitHub Actions 自动部署 Worker
```

## 部署步骤

### 1. 上传 GitHub

创建一个新仓库，例如 `xinmiao-network-check`，把 ZIP 解压后的**全部文件**上传到仓库根目录，提交到 `main` 分支。

### 2. 部署 Cloudflare Worker

可以先在 Cloudflare Dashboard 创建 Worker，也可以在本地 `worker/` 目录执行：

```bash
npm install
npx wrangler login
npx wrangler deploy
```

部署后会得到类似：

```text
https://xinmiao-network-api.<你的 workers.dev 子域>.workers.dev
```

访问：

```text
https://你的-worker.workers.dev/health
```

看到 `{"ok":true,...}` 就表示 API 正常。

### 3. 配置 GitHub Pages 前端

编辑：

```text
docs/config.js
```

把：

```js
API_BASE: "https://YOUR-WORKER-NAME.YOUR-SUBDOMAIN.workers.dev"
```

改成你自己的 Worker 地址，末尾不要加 `/`。

### 4. 开启 GitHub Pages

GitHub 仓库 → `Settings` → `Pages`

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/docs`

保存后网站地址通常为：

```text
https://你的GitHub用户名.github.io/xinmiao-network-check/
```

### 5. GitHub Actions 自动部署 Worker

GitHub 仓库 → `Settings` → `Secrets and variables` → `Actions`，添加：

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

之后修改 `worker/**` 并推送到 `main`，GitHub Actions 会自动部署 Worker。

### 6. 收紧 CORS（推荐）

第一次测试可保留：

```toml
ALLOWED_ORIGINS = "*"
```

网站正常后，在 `worker/wrangler.toml` 改成：

```toml
ALLOWED_ORIGINS = "https://YOUR-USERNAME.github.io"
```

如果以后绑定自定义域名，可以用英文逗号分隔多个 Origin。

## V1.1 改动

- 删除 Cloudflare Pages Functions 依赖。
- 前端改为 GitHub Pages 可直接托管的 `/docs` 结构。
- 静态资源全部使用相对路径，支持 GitHub 项目子路径。
- `/api/ip` 与 `/api/lookup` 改为独立 Cloudflare Worker。
- Worker 加入 CORS 与 `/health` 健康检查。
- 增加 GitHub Actions 自动部署 Worker。
- 保留 WebRTC/STUN、出口探针、延迟检测、IP 深度查询和检测报告。

## 注意

GitHub Pages 本身只能托管静态网页，所以读取真实客户端 Cloudflare `request.cf` 信息以及 IP 查询代理必须由 Worker 完成。这也是本版本将前后端拆开的原因。
