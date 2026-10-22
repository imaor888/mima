# 《你最像哪件国宝》测评网站

纯静态前端 + 独立后端服务，前端部署在 GitHub Pages，随时随地可访问。

## 一、目录结构

```
guobao/
├── index.html                    测评主页面（密码页 / 答题页 / 结果页）
├── admin.html                    数据统计后台
├── assets/
│   ├── config.js                 ★ 后端配置（三选一）
│   ├── data.js                   题库 24 题 + 12 件国宝数据
│   ├── app.js                    计分、匹配、雷达图、长图、分享、后端对接
│   └── style.css                 视觉样式（宣纸米色 + 朱砂红，移动端适配）
├── server/                       ★ 独立后端服务（Node，零框架依赖）
│   ├── src/index.js              HTTP 接口：redeem / peek / attempt / stats
│   ├── src/db-sqlite.js          SQLite 驱动（默认，零配置）
│   ├── src/db-postgres.js        PostgreSQL 驱动（可连 Supabase Postgres）
│   ├── Dockerfile / render.yaml  部署配置
│   └── README.md                 后端文档
├── supabase/schema.sql           Supabase 直连方案的表与函数（备选）
├── vendor/                       html2canvas + supabase-js（已本地化）
└── .github/workflows/deploy.yml  GitHub Pages 自动部署
```

## 二、后端三种方案（自动识别，优先级从上到下）

| 方案 | 配置方式 | 特点 |
|------|---------|------|
| **① 独立后端服务**（推荐） | `config.js` 填 `API_BASE` | 真服务端校验、原子扣减、数据统计，完整可控 |
| **② Supabase（BaaS）** | 填 `SUPABASE_URL` + `SUPABASE_ANON_KEY` | 免运维，校验在数据库层完成 |
| **③ 本地模式** | 两者都留空 | 密码与次数存浏览器本地，仅供开发预览 |

方案 ① 与 ② 并不冲突：`server` 可以把数据库指向 Supabase 的 Postgres（`DB_DRIVER=postgres` + `DATABASE_URL`），即**逻辑在自己的服务里、数据库由 Supabase 托管**。

## 三、独立后端服务

```bash
cd server
cp .env.example .env     # 改 ADMIN_TOKEN
npm start                # 默认 SQLite，监听 8787
```

接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/redeem` | 校验密码并扣减一次（事务内完成，防并发超发） |
| POST | `/api/peek` | 查剩余次数（不消耗） |
| POST | `/api/attempt` | 记录测评结果 |
| GET | `/api/stats?token=` | 数据统计（需 ADMIN_TOKEN） |
| POST | `/api/admin/codes?token=` | 新增测评码 |

**并发实测**：max_uses=3 的码并发请求 5 次 → 恰好 3 次成功、2 次 `exhausted`，无超发。
另有限流：单 IP 每分钟 30 次 redeem。

数据统计：部署后访问 `admin.html`，填后端地址 + ADMIN_TOKEN 即可看总次数、结果分布、测评码余量、最近记录，并可在线加码。

部署方式见 `server/README.md`（本地 / Docker / Render / 改 Postgres）。

## 四、Supabase 直连方案（备选）

执行 `supabase/schema.sql` 即可。安全设计：两张表开启 RLS 且**不建任何 policy**，前端无法直接读表，只能调用三个 `security definer` 函数（`peek_code` / `redeem_code` / `record_attempt`），扣减用 `FOR UPDATE` 行锁。

## 五、前端部署到 GitHub Pages

推送到 `main` 后，`.github/workflows/deploy.yml` 自动部署，约 1 分钟生效。
首次需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。

> ⚠️ Pages 是 HTTPS，后端必须也是 HTTPS，否则浏览器按混合内容拦截。

## 六、上线前待办

- [ ] 后端部署后把地址填进 `assets/config.js` 的 `API_BASE`
- [ ] `ADMIN_TOKEN` 换成强随机串（`openssl rand -hex 16`）
- [ ] `CORS_ORIGIN` 填 Pages 域名
- [ ] 12 条文物典故逐条核对出处与年代
- [ ] 用真实数据替换 `data.js` 中的 `RARITY`（当前为示意值）

## 七、已知局限

1. 长图保存：浏览器无法直接写相册，移动端引导「长按保存到相册」；需自动入相册要做成小程序。
2. 结果链接（带 `?r=` 参数）免密码直看结果，不消耗次数。
3. 限流为单进程内存级，多实例部署各实例独立计数。
4. 测评码泄露即等于次数泄露，建议按批次发放并定期巡检余量。

---

*本方案为产品设计参考，具体实施请结合平台规则与合规要求确认。*
