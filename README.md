# 鑫淼网络检测 V1.2 — GitHub Pages + Cloudflare Worker 根目录版

本版已经把原来 `worker/` 目录里的 Worker 文件全部移动到 GitHub 仓库根目录。

## 最终目录

```text
xinmiao-network-check/
├── docs/                         # GitHub Pages 前端
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── config.js                 # 填写 Worker API 地址
├── src/
│   └── index.js                  # Cloudflare Worker
├── package.json
├── wrangler.toml
├── .github/
│   └── workflows/
│       └── deploy-worker.yml
└── README.md
```

## 1. GitHub

把本 ZIP 解压后的**全部内容**上传到 `xinmiao-network-check` 仓库根目录。

GitHub Pages：

- Settings → Pages
- Source：Deploy from a branch
- Branch：main
- Folder：/docs

## 2. Cloudflare Worker

Cloudflare 连接 GitHub 仓库时直接选择这个仓库即可。

Worker 配置现在就在仓库根目录：

- `wrangler.toml`
- `package.json`
- `src/index.js`

因此不需要再填写 `worker` 根目录，也不需要 `cd worker`。

如果 Cloudflare 当前页面的“构建命令”是可选的，可留空并部署。Wrangler 配置中的入口为：

```toml
main = "src/index.js"
```

Worker 名称：

```toml
name = "xinmiao-network-api"
```

部署成功后测试：

```text
https://你的Worker地址/health
```

应返回 `ok: true`。

## 3. 把 Worker 地址写入前端

编辑：

```text
docs/config.js
```

把示例 Worker 地址替换成实际的 `workers.dev` 地址，末尾不要加 `/`。

## 4. GitHub Actions（可选）

如果需要 GitHub push 后自动部署 Worker，在仓库：

Settings → Secrets and variables → Actions

添加：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

本版 workflow 已经按**根目录 Worker**重写，不再引用 `worker/**`。

## 5. D1

当前版本没有绑定 D1，也没有任何 D1 SQL 读写，因此 D1 Reads/Writes 均为 0。
