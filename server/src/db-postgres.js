/* PostgreSQL 驱动：适合生产部署，可直接连 Supabase 的 Postgres */
function create(connectionString) {
  let pg;
  try {
    pg = require("pg");
  } catch (e) {
    throw new Error("使用 postgres 驱动请先安装依赖：npm install pg");
  }

  const pool = new pg.Pool({
    connectionString: connectionString,
    ssl: connectionString && /supabase\.(co|in)|sslmode=require/.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined,
    max: 5
  });

  const q = async function (sql, params) {
    const r = await pool.query(sql, params || []);
    return r.rows;
  };

  const ready = (async function init() {
    await q(`
      create table if not exists test_codes (
        code       text primary key,
        max_uses   integer not null default 3,
        used_count integer not null default 0,
        note       text,
        created_at timestamptz not null default now()
      );
      create table if not exists test_attempts (
        id         bigserial primary key,
        code       text not null,
        result_id  text not null,
        scores     jsonb not null,
        created_at timestamptz not null default now()
      );
      create index if not exists idx_att_code on test_attempts(code);
      create index if not exists idx_att_time on test_attempts(created_at desc);
    `);
  })();

  return {
    kind: "postgres",
    ready: ready,

    /* 原子扣减：行级锁 FOR UPDATE，防并发超发 */
    async redeem(code) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN;");
        const r = await client.query(
          "select max_uses, used_count from test_codes where code = $1 for update;",
          [code]
        );
        if (r.rows.length === 0) {
          await client.query("ROLLBACK;");
          return { ok: false, reason: "not_found" };
        }
        const row = r.rows[0];
        if (row.used_count >= row.max_uses) {
          await client.query("ROLLBACK;");
          return { ok: false, reason: "exhausted" };
        }
        await client.query(
          "update test_codes set used_count = used_count + 1 where code = $1;",
          [code]
        );
        await client.query("COMMIT;");
        return { ok: true, left: Math.max(0, row.max_uses - row.used_count - 1) };
      } catch (e) {
        try { await client.query("ROLLBACK;"); } catch (_) {}
        return { ok: false, reason: "error" };
      } finally {
        client.release();
      }
    },

    async peek(code) {
      const r = await q("select max_uses, used_count from test_codes where code = $1;", [code]);
      if (r.length === 0) return { ok: false, reason: "not_found" };
      return { ok: true, left: Math.max(0, r[0].max_uses - r[0].used_count) };
    },

    async record(code, resultId, scores) {
      await q(
        "insert into test_attempts(code, result_id, scores) values ($1, $2, $3);",
        [code, resultId, JSON.stringify(scores || {})]
      );
      return { ok: true };
    },

    async addCode(code, maxUses, note) {
      await q(
        "insert into test_codes(code, max_uses, note) values ($1, $2, $3) on conflict (code) do nothing;",
        [code, maxUses || 3, note || null]
      );
      return { ok: true };
    },

    async stats() {
      const t = (await q("select count(*)::int n from test_attempts;"))[0].n;
      const today = (await q("select count(*)::int n from test_attempts where created_at >= current_date;"))[0].n;
      const week = (await q("select count(*)::int n from test_attempts where created_at >= now() - interval '7 days';"))[0].n;
      const byResult = (await q(
        "select result_id, count(*)::int n from test_attempts group by result_id order by n desc;"
      )).map(function (r) {
        return { id: r.result_id, n: r.n, pct: t ? +(r.n * 100 / t).toFixed(1) : 0 };
      });
      const codes = (await q(
        "select code, max_uses, used_count, note, created_at from test_codes order by created_at desc;"
      )).map(function (c) {
        return { code: c.code, maxUses: c.max_uses, usedCount: c.used_count, left: Math.max(0, c.max_uses - c.used_count), note: c.note };
      });
      const recent = await q(
        "select code, result_id, created_at from test_attempts order by id desc limit 20;"
      );
      return { total: t, today: today, week: week, byResult: byResult, codes: codes, recent: recent };
    }
  };
}

module.exports = { create };
