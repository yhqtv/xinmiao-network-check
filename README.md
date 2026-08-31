# 鑫淼网络检测 V1.7 — 全功能检测套件

## 当前页面/模块

- IP 查询 + Cloudflare 网络信息
- 分流/连通性检测
- IP 深度评分
- ChatGPT / Codex 风险检测
- Claude AI 风险检测
- DNS 泄露检测框架
- WebRTC / STUN / UDP 泄露检测
- 全球 20 节点 ICMP Ping（Globalping）
- 主流互联网官方服务状态聚合
- WHOIS / RDAP 域名、IP、ASN 查询
- 浏览器设备信息、WebGL、时区、语言、触屏、DNT
- GPT / Claude IP 本地历史

## Cloudflare Secrets

### IPAPI_IS_KEY
用于完整 IP 质量数据。可以不配置，但匿名配额和字段会更少。

### GLOBALPING_TOKEN
可选。Globalping 不认证也能运行，但 Token 可获得更高的免费测试额度。

## DNS 泄露为什么还标记“需权威 DNS 探针”

真正 DNS Leak Test 必须让浏览器访问随机唯一子域名，并在该域名的权威 DNS 服务器端记录“哪台递归 Resolver 来询问”。

Cloudflare Worker 只处理 HTTP 请求，无法直接看到浏览器系统 DNS 的递归查询来源，因此不能拿 Worker 出口、DoH Reachability 或 server-side DNS 查询伪装成 DNS 泄露结果。

下一步可以二选一：
1. 接入第三方 DNS Leak Probe；
2. 用你自己的子域名 + VPS 建权威 DNS Probe，做到完全自有。

## D1

V1.7 仍然不使用 D1：
- Reads = 0
- Writes = 0

GPT / Claude 历史仅使用浏览器 localStorage，不占 Cloudflare 数据库。

## 访问

部署后：
- `/` 完整前端
- `/health` Worker 健康检查
- `/api/ip`
- `/api/quality`
- `/api/status`
- `/api/rdap?q=...`
- `POST /api/globalping`


## V1.7 网站分流测试

已加入 48 个网站：
- 中国：12
- 日本：4
- 美国：20
- 全球：12

每个站点显示：图标、名称、官方网址、浏览器侧可达状态、3 次测试中位 HTTP 耗时。
