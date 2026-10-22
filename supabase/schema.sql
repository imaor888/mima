-- ============================================================
-- 《你最像哪件国宝》测评 · Supabase 数据库初始化脚本
-- 使用方式：Supabase 控制台 → SQL Editor → 粘贴全部执行
-- 幂等设计：可重复执行，不会重复建表
-- ============================================================

-- ---------- 1. 测评码表 ----------
create table if not exists public.test_codes (
  code        text primary key,
  max_uses    integer not null default 3,
  used_count  integer not null default 0,
  note        text,
  created_at  timestamptz not null default now()
);

-- ---------- 2. 测评记录表 ----------
create table if not exists public.test_attempts (
  id          bigserial primary key,
  code        text not null,
  result_id   text not null,
  scores      jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_attempts_code on public.test_attempts(code);
create index if not exists idx_attempts_created on public.test_attempts(created_at desc);

-- ---------- 3. 开启行级安全（表不直接对外暴露） ----------
alter table public.test_codes    enable row level security;
alter table public.test_attempts enable row level security;

-- 不建任何 policy：anon 角色无法直接读写表，只能经由下方的
-- security definer 函数访问，避免密码表被拖库、次数被篡改。

-- ---------- 4. 查询剩余次数（不消耗） ----------
create or replace function public.peek_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.test_codes;
begin
  select * into v_row from public.test_codes where code = p_code;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  return json_build_object(
    'ok', true,
    'left', greatest(0, v_row.max_uses - v_row.used_count)
  );
end;
$$;

-- ---------- 5. 校验并扣减一次（原子操作，防并发超额） ----------
create or replace function public.redeem_code(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.test_codes;
begin
  -- for update 行锁，防止并发下超发
  select * into v_row from public.test_codes where code = p_code for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_row.used_count >= v_row.max_uses then
    return json_build_object('ok', false, 'reason', 'exhausted');
  end if;

  update public.test_codes
     set used_count = used_count + 1
   where code = p_code;

  return json_build_object(
    'ok', true,
    'left', greatest(0, v_row.max_uses - v_row.used_count - 1)
  );
end;
$$;

-- ---------- 6. 记录一次测评结果 ----------
create or replace function public.record_attempt(
  p_code      text,
  p_result_id text,
  p_scores    jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.test_attempts(code, result_id, scores)
  values (p_code, p_result_id, p_scores);
  return json_build_object('ok', true);
end;
$$;

-- ---------- 7. 授权 anon 角色调用上述函数 ----------
grant execute on function public.peek_code(text)                    to anon;
grant execute on function public.redeem_code(text)                  to anon;
grant execute on function public.record_attempt(text, text, jsonb)  to anon;

-- ---------- 8. 示例测评码（可自行增删） ----------
insert into public.test_codes(code, max_uses, note) values
  ('GUOBAO2026', 3, '示例码 A'),
  ('GUOBAO888',  3, '示例码 B'),
  ('GB-TEST-001',3, '示例码 C')
on conflict (code) do nothing;

-- ============================================================
-- 常用运维语句（按需手动执行）
-- ============================================================
-- 批量加码：
--   insert into public.test_codes(code, max_uses, note) values ('NEWCODE', 3, '批次说明');
--
-- 查看剩余次数：
--   select code, max_uses, used_count, max_uses - used_count as left from public.test_codes order by created_at desc;
--
-- 结果分布统计（用于替换前端的示意稀缺度）：
--   select result_id, count(*) as n,
--          round(count(*) * 100.0 / sum(count(*)) over (), 1) as pct
--   from public.test_attempts group by result_id order by n desc;
--
-- 重置某个码的次数：
--   update public.test_codes set used_count = 0 where code = 'GUOBAO2026';
