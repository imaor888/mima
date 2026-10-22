/* SQLite 驱动：零配置，开箱即用，适合单机 / 轻量部署 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

function create(file) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");

  db.exec(`
    create table if not exists test_codes (
      code       text primary key,
      max_uses   integer not null default 3,
      used_count integer not null default 0,
      note       text,
      created_at text not null default (datetime('now'))
    );
    create table if not exists test_attempts (
      id         integer primary key autoincrement,
      code       text not null,
      result_id  text not null,
      scores     text not null,
      created_at text not null default (datetime('now'))
    );
    create index if not exists idx_att_code on test_attempts(code);
    create index if not exists idx_att_time on test_attempts(created_at desc);
  `);

  return {
    kind: "sqlite",

    /* 原子扣减：SQLite 写事务锁整库，BEGIN IMMEDIATE 保证同一时刻只有一个写者 */
    redeem(code) {
      db.exec("BEGIN IMMEDIATE;");
      try {
        const row = db.prepare(
          "select max_uses, used_count from test_codes where code = ?"
        ).get(code);
        if (!row) { db.exec("ROLLBACK;"); return { ok: false, reason: "not_found" }; }
        if (row.used_count >= row.max_uses) { db.exec("ROLLBACK;"); return { ok: false, reason: "exhausted" }; }
        db.prepare("update test_codes set used_count = used_count + 1 where code = ?").run(code);
        db.exec("COMMIT;");
        return { ok: true, left: Math.max(0, row.max_uses - row.used_count - 1) };
      } catch (e) {
        try { db.exec("ROLLBACK;"); } catch (_) {}
        return { ok: false, reason: "error" };
      }
    },

    peek(code) {
      const row = db.prepare("select max_uses, used_count from test_codes where code = ?").get(code);
      if (!row) return { ok: false, reason: "not_found" };
      return { ok: true, left: Math.max(0, row.max_uses - row.used_count) };
    },

    record(code, resultId, scores) {
      db.prepare(
        "insert into test_attempts(code, result_id, scores) values (?, ?, ?)"
      ).run(code, resultId, JSON.stringify(scores || {}));
      return { ok: true };
    },

    addCode(code, maxUses, note) {
      db.prepare(
        "insert or ignore into test_codes(code, max_uses, note) values (?, ?, ?)"
      ).run(code, maxUses || 3, note || null);
      return { ok: true };
    },

    stats() {
      const total = db.prepare("select count(*) n from test_attempts").get().n;
      const today = db.prepare(
        "select count(*) n from test_attempts where date(created_at) = date('now')"
      ).get().n;
      const week = db.prepare(
        "select count(*) n from test_attempts where created_at >= datetime('now','-7 days')"
      ).get().n;
      const byResult = db.prepare(
        "select result_id, count(*) n from test_attempts group by result_id order by n desc"
      ).all().map(function (r) {
        return { id: r.result_id, n: r.n, pct: total ? +(r.n * 100 / total).toFixed(1) : 0 };
      });
      const codes = db.prepare(
        "select code, max_uses, used_count, note, created_at from test_codes order by created_at desc"
      ).all().map(function (c) {
        return { code: c.code, maxUses: c.max_uses, usedCount: c.used_count, left: Math.max(0, c.max_uses - c.used_count), note: c.note };
      });
      const recent = db.prepare(
        "select code, result_id, created_at from test_attempts order by id desc limit 20"
      ).all();
      return { total: total, today: today, week: week, byResult: byResult, codes: codes, recent: recent };
    }
  };
}

module.exports = { create };
