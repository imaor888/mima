/* 《你最像哪件国宝》测评后端服务
 * 纯 Node 内置模块，无需框架
 * 接口：
 *   POST /api/redeem          校验密码并扣减一次（真校验 + 原子扣减）
 *   POST /api/peek            查询剩余次数（不消耗）
 *   POST /api/attempt         记录一次测评结果
 *   GET  /api/stats?token=    数据统计（需管理员口令）
 *   POST /api/admin/codes     新增测评码（需管理员口令）
 *   GET  /api/health          健康检查
 */
const http = require("http");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "8787", 10);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(12).toString("hex");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const SEED_DEFAULT = (process.env.SEED_DEFAULT || "true") !== "false";

const db = require("./db").createFromEnv();

/* ---------- 简易限流（内存，防暴力试码） ---------- */
const buckets = new Map();
function limited(ip, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(ip) || { n: 0, t: now };
  if (now - b.t > windowMs) { b.n = 0; b.t = now; }
  b.n++;
  buckets.set(ip, b);
  return b.n > max;
}
setInterval(function () {
  const now = Date.now();
  for (const [k, v] of buckets) if (now - v.t > 300000) buckets.delete(k);
}, 300000).unref();

/* ---------- 工具 ---------- */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function readJson(req) {
  return new Promise(function (resolve) {
    let raw = "";
    req.on("data", function (c) {
      raw += c;
      if (raw.length > 1e5) { req.destroy(); }
    });
    req.on("end", function () {
      try { resolve(JSON.parse(raw || "{}")); } catch (e) { resolve({}); }
    });
  });
}

function adminOk(req, url) {
  const t = url.searchParams.get("token") || (req.headers["x-admin-token"] || "");
  return t === ADMIN_TOKEN;
}

/* ---------- 路由 ---------- */
const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

  if (req.method === "OPTIONS") { send(res, 204, {}); return; }

  if (p === "/api/health") {
    send(res, 200, { ok: true, driver: db.kind, time: new Date().toISOString() });
    return;
  }

  if (p === "/api/redeem" && req.method === "POST") {
    if (limited(ip, 30, 60000)) { send(res, 429, { ok: false, reason: "rate_limited" }); return; }
    const b = await readJson(req);
    const code = String(b.code || "").trim();
    if (!code) { send(res, 400, { ok: false, reason: "empty" }); return; }
    const r = db.redeem ? await db.redeem(code) : { ok: false, reason: "error" };
    send(res, 200, r);
    return;
  }

  if (p === "/api/peek" && req.method === "POST") {
    const b = await readJson(req);
    const code = String(b.code || "").trim();
    const r = await db.peek(code);
    send(res, 200, r);
    return;
  }

  if (p === "/api/attempt" && req.method === "POST") {
    const b = await readJson(req);
    const code = String(b.code || "").trim();
    const resultId = String(b.resultId || "").trim();
    if (!code || !resultId) { send(res, 400, { ok: false, reason: "bad_request" }); return; }
    const r = await db.record(code, resultId, b.scores || {});
    send(res, 200, r);
    return;
  }

  if (p === "/api/stats" && req.method === "GET") {
    if (!adminOk(req, url)) { send(res, 401, { ok: false, reason: "unauthorized" }); return; }
    const s = await db.stats();
    send(res, 200, { ok: true, data: s });
    return;
  }

  if (p === "/api/admin/codes" && req.method === "POST") {
    if (!adminOk(req, url)) { send(res, 401, { ok: false, reason: "unauthorized" }); return; }
    const b = await readJson(req);
    const code = String(b.code || "").trim();
    if (!code) { send(res, 400, { ok: false, reason: "bad_request" }); return; }
    const r = await db.addCode(code, parseInt(b.maxUses || "3", 10), b.note || null);
    send(res, 200, r);
    return;
  }

  send(res, 404, { ok: false, reason: "not_found" });
});

/* ---------- 启动 ---------- */
(async function boot() {
  // 等数据库建表完成再对外服务
  if (db.ready) {
    try {
      await db.ready;
    } catch (e) {
      console.error("[boot] 数据库初始化失败：" + e.message);
    }
  }

  if (SEED_DEFAULT) {
    try {
      const s = await db.stats();
      if (!s.codes || s.codes.length === 0) {
        await db.addCode("GUOBAO2026", 3, "示例码 A");
        await db.addCode("GUOBAO888", 3, "示例码 B");
        await db.addCode("GB-TEST-001", 3, "示例码 C");
        console.log("[seed] 已写入 3 个示例测评码");
      }
    } catch (e) {
      console.log("[seed] 跳过：", e.message);
    }
  }

  server.listen(PORT, function () {
    console.log("------------------------------------------");
    console.log(" 国宝测评后端已启动");
    console.log(" 地址     : http://localhost:" + PORT);
    console.log(" 数据库   : " + db.kind);
    console.log(" 管理口令 : " + ADMIN_TOKEN);
    console.log("------------------------------------------");
  });
})();
