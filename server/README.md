# 测评后端服务（真密码校验 + 原子次数扣减 + 数据统计）

纯 Node 内置模块实现，无 Web 框架依赖。前端通过 HTTP 调用，密码校验与次数扣减都在服务端完成，**前端无法绕过**。

## 一、快速启动

### 方式 A：本地 / VPS（SQLite，零配置）

```bash
cd server
cp .env.example .env          # 修改 ADMIN_TOKEN
npm start                     # 即 node --experimental-sqlite src/index.js
```

> SQLite 需要 Node ≥ 22.5，且启动参数带 `--experimental-sqlite`（`npm start` 已包含）。

### 方式 B：Docker

```bash
docker build -t guobao-api .
docker run -d -p 8787:8787 \
  -e ADMIN_TOKEN=你的长随机串 \
  -v guobao-data:/app/data \
  guobao-api
```

### 方式 C：Render

仓库根目录已放 `render.yaml`，在 Render 控制台 **New → Blueprint** 选本仓库即可。

> ⚠️ **免费层没有持久磁盘**。Render 的 Disk 是付费功能（Starter 起），免费层用 SQLite
> 会在每次重新部署、休眠唤醒后**丢数据**。所以根目录 `render.yaml` 默认配的是
> **免费层 + PostgreSQL**，免费库可用 Supabase 或 Neon 的免费 Postgres。
>
> 若你确实要用 SQLite，把 `server/render.sqlite.yaml` 的内容替换到根目录 `render.yaml`，
> 并把 `plan` 改成 `starter`（每月约 $7），磁盘才会生效。

免费层还有两个特性：15 分钟无访问会休眠，冷启动约 30 秒；每月有免费时长额度。

部署后 Render 会给一个 `https://xxx.onrender.com` 域名（自带 HTTPS），把它填进前端
`assets/config.js` 的 `API_BASE` 即可。

### 方式 D：改用 PostgreSQL（推荐生产环境）

```bash
npm install pg
```
`.env` 中设置：

```
DB_DRIVER=postgres
DATABASE_URL=postgresql://postgres:密码@db.xxxx.supabase.co:5432/postgres
```

**可以直接连 Supabase 的 Postgres**（Supabase 控制台 → Project Settings → Database → Connection string → URI），这样数据库仍由 Supabase 托管，而校验逻辑在自己的服务里。

启动改 `npm run start:pg`（不带 sqlite 实验参数）。

## 二、接口

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/api/health` | 健康检查，返回 `driver` | 无 |
| POST | `/api/redeem` | 校验密码并**扣减一次** | 无 |
| POST | `/api/peek` | 查询剩余次数（不消耗） | 无 |
| POST | `/api/attempt` | 记录一次测评结果 | 无 |
| GET | `/api/stats?token=` | 数据统计 | ADMIN_TOKEN |
| POST | `/api/admin/codes?token=` | 新增测评码 | ADMIN_TOKEN |

### 请求与响应示例

```bash
curl -X POST http://localhost:8787/api/redeem \
  -H "Content-Type: application/json" -d '{"code":"GUOBAO2026"}'
# 成功 {"ok":true,"left":2}
# 无效 {"ok":false,"reason":"not_found"}
# 用完 {"ok":false,"reason":"exhausted"}

curl -X POST http://localhost:8787/api/attempt \
  -H "Content-Type: application/json" \
  -d '{"code":"GUOBAO2026","resultId":"ding","scores":{"heavy":80,"fine":50}}'
# {"ok":true}

curl "http://localhost:8787/api/stats?token=你的口令"
# {"ok":true,"data":{"total":3,"today":3,"week":3,"byResult":[{"id":"ding","n":1,"pct":33.3}],"codes":[...],"recent":[...]}}
```

### 并发安全

`redeem` 在单个事务内完成「读—判—写」：

- SQLite：`BEGIN IMMEDIATE` 写事务锁
- PostgreSQL：`SELECT ... FOR UPDATE` 行级锁

**实测**：max_uses=3 的码并发请求 5 次，恰好 3 次成功、2 次返回 `exhausted`，无超发。

另有内存级限流：单 IP 每分钟最多 30 次 redeem，返回 `rate_limited`。

## 三、数据统计后台

部署前端后访问 `/admin.html`，填写：

- 后端地址（如 `https://your-api.example.com`）
- 管理口令（ADMIN_TOKEN）

即可看到：总测评次数 / 今日 / 近 7 日、12 件国宝的分布柱状图、测评码余量、最近 20 条记录，并可在线新增测评码。

## 四、环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | 8787 | 服务端口 |
| `DB_DRIVER` | sqlite | `sqlite` 或 `postgres` |
| `DB_FILE` | ./data/guobao.db | sqlite 数据文件 |
| `DATABASE_URL` | — | postgres 连接串 |
| `ADMIN_TOKEN` | 随机生成（启动时打印） | 统计与加码接口口令 |
| `CORS_ORIGIN` | * | 建议线上填前端域名 |
| `SEED_DEFAULT` | true | 首次启动写入 3 个示例码 |

## 五、部署注意事项

1. **必须 HTTPS**。前端跑在 GitHub Pages（HTTPS），若后端是 HTTP，浏览器会以混合内容拦截请求。Render / Railway / Fly 默认提供 HTTPS。
2. **`ADMIN_TOKEN` 必须改**。用 `openssl rand -hex 16` 生成一个长随机串。
3. **SQLite 要挂盘**。Docker 部署必须挂载 `/app/data`，否则重启数据丢失。
4. **换域名要同步改 CORS_ORIGIN**。

## 六、已知局限

- 限流是单进程内存级，多实例部署时各实例独立计数；生产高并发建议换 Redis 或在网关层限流。
- 统计接口的 `byResult` 返回 `result_id`，中文名由后台页面 `admin.html` 映射。
- 未做用户体系，测评码即凭证，泄露等于次数泄露，建议按批次发放并定期巡检余量。
