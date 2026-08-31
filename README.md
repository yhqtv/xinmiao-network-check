# 鑫淼网络检测 V2.3 — 全功能检测套件

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

V2.3 仍然不使用 D1：
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


## V2.3 网站分流测试

已加入 48 个网站：
- 中国：12
- 日本：4
- 美国：20
- 全球：12

每个站点显示：图标、名称、官方网址、浏览器侧可达状态、3 次测试中位 HTTP 耗时。


## V2.3 首页三线路出口 IP

首页新增类似 ip111.cn 的快速出口判断：
- 国内测试
- 国外测试
- Google / 国际测试

页面会比较不同探针返回的公网 IP，并自动提示“同一出口 / 多出口分流”。

技术说明：普通网页无法强制 Google 自己返回“Google 服务器看到的客户端公网 IP”。因此第三项明确标注为独立国际回显探针，不伪造 Google 出口结果。若以后部署 Google 路径专用自有回显节点，可以替换成真正的 Google 路由出口探针。


## V2.3 首页 IP 隐私开关

首页新增“一键隐藏 50% IP”：
- IPv4：例如 `123.45.67.89` 显示为 `123.45.***.***`
- IPv6：隐藏地址后半部分
- 同时作用于首页主公网 IP 和三线路出口 IP
- 再次点击可恢复完整 IP
- 状态保存在浏览器 localStorage，刷新页面后仍保持
- 仅改变前端显示，不改变真实检测结果、API 返回值和分流判断


## V2.3 修复：真正的国内出口 IP 探针

V1.9 的“国内测试”错误地请求本站 Cloudflare Worker，因此当代理规则把 `ip.yhqtv.com` / Cloudflare 走 PROXY 时，会显示国外代理 IP。

V2.3 已改为浏览器直接请求中国境内 IP 回显：

1. 主探针：`https://uapis.cn/api/v1/network/myip`
2. 备用探针：`https://whois.pconline.com.cn/ipJson.jsp`（JSONP）

这些请求不经过本站 Worker。代理软件如果把中国大陆域名分配为 DIRECT，探针看到的就是国内直连出口 IP。

国内两个探针同时成功时：
- IP 一致：页面标记“双探针一致”
- IP 不一致：页面直接提示两条国内域名本身被分到了不同线路，便于检查 Clash / Surge / Shadowrocket / sing-box 规则

国外测试继续使用国际公网 IP 回显。
Google 测试仍明确标注为“独立国际对照，非 Google 官方 IP 回显”，不伪造 Google 服务器侧结果。

注意：第三方公开探针可能临时限流、变更 CORS 或不可用，因此正式长期运营最好最终部署 `cn-ip.yhqtv.com` 到真正的中国大陆服务器，完全由自己控制。


## V2.3 三线路出口国家地区

三线路出口 IP 卡片现在同时显示：
- 国家 / 国家代码
- 州 / 省 / 地区
- 城市
- ASN
- 网络组织 / ISP（数据源能返回时）

地理和 ASN 信息由 Worker 服务端查询 `ipapi.is`，避免把 API Key 暴露到浏览器。
IP 隐私开关仍只隐藏 IP 本身；国家地区仍保留显示，方便截图时判断三条线路分别落在哪个国家。


## V2.3 国家地区中英文双显

三线路出口 IP 的地理信息改为中英文同时显示，例如：

- `中国 / China · 吉林 / Jilin · 长春 / Changchun`
- `德国 / Germany · 黑森州 / Hesse · 法兰克福 / Frankfurt`
- `美国 / United States · 加利福尼亚州 / California · 洛杉矶 / Los Angeles`

常见国家、地区和城市内置中文映射；没有中文映射的数据会保留服务端返回的英文原名，避免错误翻译。


## V2.3 DNS 泄露风险检测（纯 GitHub + Cloudflare）

本版不需要 VPS、不需要 D1、不需要 MySQL/Redis。

检测内容：
- HTTPS 公网出口 IP
- 公网 IP 国家 / 地区
- WebRTC/STUN 暴露的公网 IP
- WebRTC 是否出现与 HTTPS 出口不同的额外公网 IP
- Cloudflare DoH 可达性
- Google DoH 可达性
- Quad9 DoH 可达性
- 首页国内/国外出口分流信号
- 本地透明风险评分与结论

重要边界：
- 这是“DNS / 网络泄露风险检测”
- 不是权威 DNS Resolver 枚举
- DoH“可达”只代表浏览器能访问该 DoH endpoint，不代表系统当前 DNS 正在使用它
- 仅使用 Cloudflare DNS + Worker 无法可靠获得用户真实递归 Resolver 的来源 IP
- 页面不会把 Worker IP、DoH 节点 IP 或第三方回显 IP 冒充成真实 DNS Resolver

D1 Reads = 0
D1 Writes = 0


## V2.3.1 DNS 页面彻底修复

- 删除旧 V1.6 DNS 占位页面
- 新 DNS 泄露风险检测页正式使用 `page-dns`
- 顶部“DNS泄露”导航直接打开新页面
- 进入 DNS 页面后自动运行检测
- 保留“重新检测”按钮
- 删除旧 `checkDnsArchitecture()` 占位逻辑
- VPS = 0
- D1 Reads = 0
- D1 Writes = 0
