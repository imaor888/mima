/* 数据库驱动选择：DB_DRIVER=sqlite（默认）| postgres */
function createFromEnv() {
  const driver = (process.env.DB_DRIVER || "sqlite").toLowerCase();

  if (driver === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DB_DRIVER=postgres 时必须提供 DATABASE_URL");
    return require("./db-postgres").create(url);
  }

  if (driver === "sqlite") {
    const file = process.env.DB_FILE || "./data/guobao.db";
    return require("./db-sqlite").create(file);
  }

  throw new Error("未知的 DB_DRIVER：" + driver + "（可选 sqlite / postgres）");
}

module.exports = { createFromEnv };
