# Status Worker 管理入口

## 端点

统一前缀 `/api/admin`，全部要求 `X-Gateway-Automation-Token` 请求头（`/health` 除外，仅用于探活，不返回敏感信息）：

| 方法 | 路径 | 用途 | Body |
|---|---|---|---|
| GET | `/api/admin/health` | 探活，返回各项配置是否就绪（不含密钥值） | — |
| POST | `/api/admin/cycle/trigger` | 立即执行一次检测周期 | — |
| POST | `/api/admin/data/purge` | 清除最近 N 天的历史数据后立即重新运行一次 | `{"days": 1}` |
| DELETE | `/api/admin/snapshots` | 删除某天的快照，省略 `componentId` 则删除该天全部组件 | `{"date": "2026-09-05", "componentId"?: "google_pa"}` |
| PUT | `/api/admin/snapshots` | 人工写入/覆盖某天某组件的记录 | `{"date": "...", "componentId": "...", "status": "operational\|degraded\|outage\|nodata", "uptimeRatio"?: 0-100, "totalEvents"?: number, "failureEvents"?: number}` |

`componentId` 必须是当前受监控的组件 ID 之一（核心四项 + 各翻译引擎/基础设施探针 ID），非法值直接 400。旧的 `/_force_trigger`、`/_admin/purge`、`X-Admin-Secret` 已完全废弃并从代码里移除，不再兼容。

## 为什么迁移到自定义域名 + 单一路径前缀

Cloudflare 的 WAF 自定义规则只能挂在走 Cloudflare 代理的 zone（即自定义域名）上，`*.workers.dev` 不经过你的 zone，WAF 规则对它完全不生效。`wrangler.toml` 已经把 `workers_dev` 关掉并绑定了 `routes`（`custom_domain = true`），所以这个 worker 现在**只能**通过你配置的自定义域名访问，`*.workers.dev` 地址不再存在。

所有管理操作也统一收敛到 `/api/admin/*` 一个路径前缀下，这样只需要写一条 WAF 规则就能覆盖全部管理端点，不用为每个端点单独配置。

## 建议的 WAF 自定义规则

在该自定义域名所在 zone 的 Security → WAF → Custom rules 里新建一条规则，效果是"没带自动化请求头的一律挑战/拦截"：

- 字段：`Custom filter expression`
- 表达式：
  ```
  (http.request.uri.path matches "^/api/admin/") and not (http.request.headers["x-gateway-automation-token"][0] ne "")
  ```
- 动作：`Block`（或先用 `Managed Challenge` 观察一阵子再收紧成 `Block`）

这条规则只检查请求头**是否存在**，不需要把真正的密钥值写进 WAF 规则里——真正的鉴权（时间安全的字符串比较）在 Worker 代码里做，WAF 这一层只是负责把没有这个请求头的自动化探测流量挡在门外，两层职责分开，WAF 规则改了也不影响密钥轮换，反之亦然。

## GitHub 端需要配置的变量/密钥

- Repository/Organization Variable `STATUS_ADMIN_DOMAIN`：自定义域名（不含协议前缀，如 `status-admin.translate.sub.qzz.io`）。部署脚本会用它替换 `wrangler.toml` 里的 `REPLACE_WITH_ADMIN_CUSTOM_DOMAIN`，缺失时部署会直接失败退出，不会悄悄部署出一个没有路由、永远打不通的 worker。
- Repository Secret `STATUS_ADMIN_TOKEN`：即 Worker 里的 `ADMIN_API_SECRET`，`deploy-status.yml` 和 `status-admin.yml` 都从这个名字读取。

`.github/workflows/status-admin.yml` 已经改造为支持全部四种操作（`trigger_cycle` / `purge_recent` / `delete_snapshot` / `upsert_snapshot`）的 `workflow_dispatch` 表单，人工管理某一天的记录直接在 Actions 页面手动运行这个 workflow 并填参数即可，不需要手写 curl。
