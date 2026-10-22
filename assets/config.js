/* 后端配置：三选一，从上到下优先级递减
 *
 * ① 独立后端服务（推荐，功能最全：真校验 + 原子扣减 + 数据统计）
 *    API_BASE = "https://your-api.example.com"
 *    配套使用 server/ 目录下的 Node 服务
 *
 * ② Supabase（BaaS，免运维）
 *    SUPABASE_URL + SUPABASE_ANON_KEY，配合 supabase/schema.sql
 *
 * ③ 都不填 → 本地模式：密码与次数仅存本机浏览器，供开发预览
 */
window.GB_CONFIG = {
  API_BASE: "",

  // Supabase（可选，填了且 API_BASE 为空时生效）
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: ""
};
