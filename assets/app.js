/* 《你最像哪件国宝》测评 - 交互逻辑 */
(function () {
  const D = window.GB_DATA;
  const Q = D.QUESTIONS;
  const TOTAL = Q.length;

  const $ = (id) => document.getElementById(id);
  const USED_KEY = (pwd) => "gb_used_" + pwd;

  /* ---- 后端模式：API_BASE > Supabase > 本地 ---- */
  const CFG = window.GB_CONFIG || {};
  const API = (CFG.API_BASE || "").trim().replace(/\/$/, "");
  const BACKEND = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const USE_API = !!API;
  let sb = null;
  if (BACKEND && window.supabase) {
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  }
  if (!USE_API && !BACKEND) {
    document.addEventListener("DOMContentLoaded", function () {
      const t = document.createElement("div");
      t.style.cssText = "max-width:560px;margin:0 auto;padding:8px 20px;font-size:11px;color:#8b8272;font-family:-apple-system,sans-serif;";
      t.textContent = "当前为本地模式（未配置 Supabase）：密码与次数仅保存在本机浏览器。";
      document.body.insertBefore(t, document.body.firstChild);
    });
  }

  // 运行状态
  let pwd = "";
  let idx = 0;
  let answers = new Array(TOTAL).fill(0);
  let current = null; // 当前结果对象
  let currentScores = null;
  let remaining = 0;  // 服务端返回的剩余次数
  let shareMode = false; // 通过分享链接进入（只读看结果）

  /* ================= 页面切换 ================= */
  function show(name) {
    ["gate", "quiz", "result"].forEach(function (n) {
      $(n).classList.toggle("hidden", n !== name);
    });
    window.scrollTo(0, 0);
  }

  /* ================= 次数管理 ================= */
  function usedCount(p) {
    const v = parseInt(localStorage.getItem(USED_KEY(p)) || "0", 10);
    return isNaN(v) ? 0 : v;
  }
  function leftCount(p) {
    const max = D.PASSWORDS[p] || 0;
    return Math.max(0, max - usedCount(p));
  }
  function consume(p) {
    localStorage.setItem(USED_KEY(p), String(usedCount(p) + 1));
  }

  /* ================= 密码页 ================= */
  /* 统一入口：验证密码并扣减一次，返回 {ok, left, reason} */
  async function redeem(v) {
    // ① 独立后端服务
    if (USE_API) {
      try {
        const res = await fetch(API + "/api/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: v })
        });
        const j = await res.json();
        return j || { ok: false, reason: "error" };
      } catch (e) {
        return { ok: false, reason: "error" };
      }
    }
    // ② Supabase
    if (BACKEND) {
      try {
        const res = await sb.rpc("redeem_code", { p_code: v });
        if (res.error) return { ok: false, reason: "error" };
        return res.data || { ok: false, reason: "error" };
      } catch (e) {
        return { ok: false, reason: "error" };
      }
    }
    // ③ 本地模式
    if (!Object.prototype.hasOwnProperty.call(D.PASSWORDS, v)) {
      return { ok: false, reason: "not_found" };
    }
    if (leftCount(v) <= 0) return { ok: false, reason: "exhausted" };
    consume(v);
    return { ok: true, left: leftCount(v) };
  }

  /* 记录一次结果（失败静默，不影响用户看到结果） */
  function recordAttempt(resultId, scores) {
    if (USE_API) {
      fetch(API + "/api/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pwd, resultId: resultId, scores: scores })
      }).then(function () {}, function () {});
      return;
    }
    if (BACKEND && sb) {
      sb.rpc("record_attempt", {
        p_code: pwd, p_result_id: resultId, p_scores: scores
      }).then(function () {}, function () {});
    }
  }

  const REASON_TEXT = {
    not_found: "密码无效，请核对后重试",
    exhausted: "该密码的次数已用完，请更换密码",
    error: "网络异常，请稍后重试"
  };

  $("btn-start").addEventListener("click", async function () {
    const v = $("pwd").value.trim();
    $("err").textContent = "";
    if (!v) { $("err").textContent = "请输入密码"; return; }

    $("btn-start").disabled = true;
    $("btn-start").textContent = "校验中…";
    const r = await redeem(v);
    $("btn-start").disabled = false;
    $("btn-start").textContent = "开 始 测 评";

    if (!r.ok) { $("err").textContent = REASON_TEXT[r.reason] || "密码无效"; return; }
    pwd = v;
    remaining = r.left;
    resetQuiz();
    show("quiz");
    toast("本码还可测 " + remaining + " 次");
  });

  $("pwd").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("btn-start").click();
  });

  /* ================= 答题 ================= */
  function resetQuiz() {
    idx = 0;
    answers = new Array(TOTAL).fill(0);
    renderQuestion();
  }

  function renderQuestion() {
    const q = Q[idx];
    $("q-index").textContent = "第 " + (idx + 1) + " 题 / 共 " + TOTAL + " 题";
    $("q-text").textContent = q.text;
    $("bar").style.width = ((idx + 1) / TOTAL * 100) + "%";
    $("num").textContent = (idx + 1) + "/" + TOTAL;

    const box = $("options");
    box.innerHTML = "";
    const labels = ["完全不像我", "不太像我", "说不好", "比较像我", "完全是我"];
    for (let s = 1; s <= 5; s++) {
      const b = document.createElement("button");
      b.innerHTML = '<span class="dot"></span><span>' + s + "　" + labels[s - 1] + "</span>";
      if (answers[idx] === s) b.classList.add("on");
      b.addEventListener("click", function () {
        answers[idx] = s;
        Array.prototype.forEach.call(box.children, function (c) { c.classList.remove("on"); });
        b.classList.add("on");
        $("btn-next").disabled = false;
      });
      box.appendChild(b);
    }

    $("btn-prev").disabled = (idx === 0);
    $("btn-next").disabled = (answers[idx] === 0);
    $("btn-next").textContent = (idx === TOTAL - 1) ? "查看结果" : "下一题";
  }

  $("btn-prev").addEventListener("click", function () {
    if (idx > 0) { idx--; renderQuestion(); }
  });

  $("btn-next").addEventListener("click", function () {
    if (answers[idx] === 0) return;
    if (idx < TOTAL - 1) { idx++; renderQuestion(); return; }
    finish();
  });

  /* ================= 计分与匹配 ================= */
  function score() {
    const raw = {};
    D.DIMS.forEach(function (d) { raw[d.key] = 0; });
    Q.forEach(function (q, i) {
      const v = q.reverse ? (6 - answers[i]) : answers[i];
      raw[q.dim] += v;
    });
    const std = {};
    D.DIMS.forEach(function (d) {
      std[d.key] = Math.round((raw[d.key] - 4) / 16 * 100);
    });
    return std;
  }

  function distance(std, profile) {
    let sum = 0;
    D.DIMS.forEach(function (d, i) {
      const w = D.WEIGHTS[d.key] || 1;
      const diff = std[d.key] - profile[i];
      sum += w * diff * diff;
    });
    return Math.sqrt(sum);
  }

  function match(std) {
    const list = D.RESULTS.map(function (r) {
      return { r: r, d: distance(std, r.profile) };
    }).sort(function (a, b) { return a.d - b.d; });

    const avg = list.reduce(function (s, x) { return s + x.d; }, 0) / list.length;
    const dmin = list[0].d;
    const ratio = avg > 0 ? dmin / avg : 1;
    const pct = Math.min(98, Math.max(78, Math.round(78 + 20 * (1 - ratio))));

    return {
      main: list[0].r,
      second: list[1].r,
      far: list[list.length - 1].r,
      pct: pct
    };
  }

  function finish() {
    const std = score();
    const m = match(std);
    current = m;
    currentScores = std;
    renderResult(m, std);
    show("result");
    recordAttempt(m.main.id, std);
  }

  /* ================= 雷达图 ================= */
  function drawRadar(canvas, std) {
    const dpr = window.devicePixelRatio || 1;
    const size = 300;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    const g = canvas.getContext("2d");
    g.scale(dpr, dpr);
    g.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2 + 4, R = 92;
    const n = D.DIMS.length;
    const pt = function (i, r) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };

    // 网格
    [0.25, 0.5, 0.75, 1].forEach(function (k) {
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const p = pt(i, R * k);
        if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
      }
      g.closePath();
      g.strokeStyle = "rgba(44,39,33,0.13)";
      g.lineWidth = 1;
      g.stroke();
    });
    // 轴线
    for (let i = 0; i < n; i++) {
      const p = pt(i, R);
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(p[0], p[1]);
      g.strokeStyle = "rgba(44,39,33,0.1)";
      g.stroke();
    }
    // 数据面
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const v = Math.max(4, std[D.DIMS[i].key]) / 100;
      const p = pt(i, R * v);
      if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]);
    }
    g.closePath();
    g.fillStyle = "rgba(158,59,48,0.17)";
    g.fill();
    g.strokeStyle = "#9e3b30";
    g.lineWidth = 1.6;
    g.stroke();
    // 顶点
    for (let i = 0; i < n; i++) {
      const v = Math.max(4, std[D.DIMS[i].key]) / 100;
      const p = pt(i, R * v);
      g.beginPath();
      g.arc(p[0], p[1], 3, 0, Math.PI * 2);
      g.fillStyle = "#9e3b30";
      g.fill();
    }
    // 标签
    g.font = '13px "Songti SC", "SimSun", serif';
    g.fillStyle = "#5b5347";
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const p = pt(i, R + 22);
      g.fillText(D.DIMS[i].name, p[0], p[1]);
    }
  }

  /* ================= 结果页 ================= */
  function renderResult(m, std) {
    const r = m.main;
    $("r-name").textContent = r.name;
    $("r-tag").textContent = r.tag;
    $("r-quote").textContent = r.quote;
    $("r-pct").textContent = m.pct + "%";
    $("r-rarity").textContent = (D.RARITY[r.id] || 5) + "%";

    drawRadar($("radar"), std);

    $("r-traits").innerHTML = r.traits.map(function (t) {
      return "<span>" + t + "</span>";
    }).join("");
    $("r-shadow").textContent = r.shadow;
    $("r-story").textContent = r.story;
    $("r-advice").textContent = r.advice;
    $("r-second").textContent = r2name(m.second);
    $("r-far").textContent = r2name(m.far);

    $("r-dims").innerHTML = D.DIMS.map(function (d) {
      const v = std[d.key];
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px;">' +
        '<span style="flex:0 0 44px;font-size:14px;">' + d.name + '</span>' +
        '<span style="flex:1;height:5px;background:#efe7d7;border-radius:999px;overflow:hidden;">' +
        '<i style="display:block;height:100%;width:' + v + '%;background:#9e3b30;"></i></span>' +
        '<span style="flex:0 0 30px;text-align:right;font-size:12px;color:#8b8272;font-family:-apple-system,sans-serif;">' + v + '</span>' +
        '</div>';
    }).join("");

    const left = (USE_API || BACKEND) ? remaining : leftCount(pwd);
    $("btn-again").textContent = "再测一次（剩余 " + left + " 次）";
    $("btn-again").disabled = (left <= 0);

    buildShot(m, std);
  }

  function r2name(r) { return r.name + "·" + r.tag; }

  /* ================= 保存长图 ================= */
  function buildShot(m, std) {
    const r = m.main;
    const s = $("shot");
    s.innerHTML =
      '<div style="text-align:center;border-bottom:1px solid rgba(44,39,33,.14);padding-bottom:22px;margin-bottom:22px;">' +
      '<div style="font-size:12px;letter-spacing:.34em;color:#a8874f;margin-bottom:8px;">你最像哪件国宝</div>' +
      '<div style="font-size:34px;letter-spacing:.1em;margin-bottom:6px;">' + r.name + '</div>' +
      '<div style="display:inline-block;font-size:13px;color:#9e3b30;border:1px solid rgba(158,59,48,.34);border-radius:999px;padding:3px 14px;">' + r.tag + '</div>' +
      '<div style="font-size:17px;line-height:1.95;color:#5b5347;margin-top:14px;">' + r.quote + '</div>' +
      '</div>' +
      '<div id="shot-radar" style="text-align:center;margin:18px 0;"></div>' +
      '<div style="display:flex;justify-content:center;gap:40px;font-family:-apple-system,sans-serif;padding:14px 0;border-top:1px solid rgba(44,39,33,.14);border-bottom:1px solid rgba(44,39,33,.14);margin-bottom:22px;">' +
      '<div style="text-align:center;"><div style="font-size:22px;color:#9e3b30;">' + m.pct + '%</div><div style="font-size:11px;color:#8b8272;letter-spacing:.1em;">匹配度</div></div>' +
      '<div style="text-align:center;"><div style="font-size:22px;color:#9e3b30;">' + (D.RARITY[r.id] || 5) + '%</div><div style="font-size:11px;color:#8b8272;letter-spacing:.1em;">同款占比</div></div>' +
      '</div>' +
      secHtml("你的三个特质", '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + r.traits.map(function (t) { return '<span style="background:#efe7d7;border-radius:6px;padding:7px 13px;font-size:14px;">' + t + '</span>'; }).join("") + '</div>') +
      secHtml("一个提醒", '<div style="background:#fbf6f4;border-left:3px solid #c25a4c;padding:13px 15px;font-size:14px;line-height:1.9;color:#5b5347;">' + r.shadow + '</div>') +
      secHtml("这件国宝", '<div style="font-size:13px;line-height:1.95;color:#8b8272;font-family:-apple-system,sans-serif;">' + r.story + '</div>') +
      secHtml("给你的建议", '<div style="background:#efe7d7;border-radius:9px;padding:15px 16px;font-size:15px;line-height:1.95;">' + r.advice + '</div>') +
      secHtml("关系", '<div style="font-family:-apple-system,sans-serif;font-size:13px;color:#5b5347;">另一面：' + r2name(m.second) + '　·　最不像：' + r2name(m.far) + '</div>') +
      '<div style="text-align:center;font-size:11px;color:#8b8272;font-family:-apple-system,sans-serif;line-height:1.85;margin-top:26px;padding-top:18px;border-top:1px solid rgba(44,39,33,.14);">' +
      '本测评为文化趣味型自我探索参考<br>不构成心理评估或医学诊断</div>';

    const holder = s.querySelector("#shot-radar");
    const cv = document.createElement("canvas");
    holder.appendChild(cv);
    drawRadar(cv, std);
  }

  function secHtml(title, body) {
    return '<div style="margin-bottom:22px;">' +
      '<div style="font-size:14px;letter-spacing:.2em;color:#a8874f;margin-bottom:12px;">' + title + '</div>' +
      body + '</div>';
  }

  $("btn-save").addEventListener("click", function () {
    if (!current) return;
    toast("正在生成图片…");
    const s = $("shot");
    s.style.left = "-10000px";
    const opt = { scale: 2, backgroundColor: "#f6f1e6", useCORS: true, logging: false };
    window.html2canvas(s, opt).then(function (canvas) {
      const url = canvas.toDataURL("image/png");
      showImageModal(url);
    }).catch(function () {
      toast("生成失败，可改用截屏保存");
    });
  });

  function showImageModal(url) {
    const mask = document.createElement("div");
    mask.className = "mask";
    mask.style.position = "fixed";
    mask.innerHTML =
      '<div class="modal" style="max-height:88vh;overflow:auto;">' +
      '<div style="font-size:13px;color:#8b8272;font-family:-apple-system,sans-serif;margin-bottom:12px;">' +
      (isMobile() ? "长按图片 → 保存到相册" : "右键图片 → 图片另存为") + '</div>' +
      '<img src="' + url + '" style="width:100%;border-radius:8px;display:block;" />' +
      '<button class="btn btn-ghost" id="dl" style="margin-top:14px;">下载图片</button>' +
      '<button class="btn btn-ghost" id="cl" style="margin-top:9px;">关闭</button>' +
      '</div>';
    document.body.appendChild(mask);
    mask.querySelector("#cl").addEventListener("click", function () { document.body.removeChild(mask); });
    mask.querySelector("#dl").addEventListener("click", function () {
      const a = document.createElement("a");
      a.href = url;
      a.download = "我最像的国宝-" + current.main.name + ".png";
      a.click();
    });
    mask.addEventListener("click", function (e) { if (e.target === mask) document.body.removeChild(mask); });
    toast("图片已生成");
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  /* ================= 复制链接 ================= */
  $("btn-copy").addEventListener("click", function () {
    if (!current) return;
    const s = currentScores;
    const code = D.DIMS.map(function (d) { return s[d.key]; }).join("-");
    const base = location.origin + location.pathname;
    const url = base + "?r=" + current.main.id + "&s=" + code;

    const done = function () { toast("链接已复制，打开即可查看这份结果"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(fallback);
    } else { fallback(); }

    function fallback() {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { promptBox(url); }
      document.body.removeChild(ta);
    }
    function promptBox(u) {
      window.prompt("复制下面的链接分享：", u);
    }
  });

  /* ================= 再测一次 ================= */
  $("btn-again").addEventListener("click", async function () {
    if (shareMode) return; // 分享进入时由 onclick 处理跳转
    if (!USE_API && !BACKEND) {
      if (leftCount(pwd) <= 0) { toast("次数已用完，请更换密码"); return; }
      consume(pwd);
      remaining = leftCount(pwd);
      resetQuiz();
      show("quiz");
      return;
    }
    $("btn-again").disabled = true;
    const r = await redeem(pwd);
    $("btn-again").disabled = false;
    if (!r.ok) {
      toast(REASON_TEXT[r.reason] || "次数不足");
      renderResult(current, currentScores);
      return;
    }
    remaining = r.left;
    resetQuiz();
    show("quiz");
    toast("本码还可测 " + remaining + " 次");
  });

  /* ================= 好评有礼 ================= */
  $("btn-gift").addEventListener("click", function () {
    const mask = document.createElement("div");
    mask.className = "mask";
    mask.style.position = "fixed";
    mask.innerHTML =
      '<div class="modal">' +
      '<div class="ic">谢</div>' +
      '<h4>好评有礼</h4>' +
      '<p>如果这份测评让你觉得有意思，欢迎在店铺给个好评～</p>' +
      '<p>好评后联系客服，发一张好评截图，即可获得 <span class="hl">1 元返现</span>。</p>' +
      '<p style="font-size:12px;color:#8b8272;">（返现将在客服核实后发放，感谢你的支持）</p>' +
      '<button class="btn btn-primary" id="ok">知道啦</button>' +
      '</div>';
    document.body.appendChild(mask);
    mask.querySelector("#ok").addEventListener("click", function () {
      document.body.removeChild(mask);
    });
    mask.addEventListener("click", function (e) { if (e.target === mask) document.body.removeChild(mask); });
  });

  /* ================= Toast ================= */
  let toastTimer = null;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  /* ================= 分享链接直达结果 ================= */
  function loadFromUrl() {
    const p = new URLSearchParams(location.search);
    const id = p.get("r");
    if (!id) return false;
    const r = D.RESULTS.filter(function (x) { return x.id === id; })[0];
    if (!r) return false;

    const code = (p.get("s") || "").split("-").map(Number);
    let std;
    if (code.length === D.DIMS.length && code.every(function (n) { return !isNaN(n); })) {
      std = {};
      D.DIMS.forEach(function (d, i) { std[d.key] = code[i]; });
    } else {
      std = {};
      D.DIMS.forEach(function (d, i) { std[d.key] = r.profile[i]; });
    }

    const m = { main: r, second: r, far: r, pct: 92 };
    const others = D.RESULTS.filter(function (x) { return x.id !== id; });
    const sorted = others.map(function (x) {
      return { r: x, d: distance(std, x.profile) };
    }).sort(function (a, b) { return a.d - b.d; });
    m.second = sorted[0].r;
    m.far = sorted[sorted.length - 1].r;

    current = m;
    currentScores = std;
    renderResult(m, std);

    // 分享进入：隐藏次数相关逻辑，改为「我也要测」
    shareMode = true;
    $("btn-again").textContent = "我也要测一测";
    $("btn-again").disabled = false;
    $("btn-again").onclick = function () { location.href = location.origin + location.pathname; };

    show("result");
    return true;
  }

  /* ================= 启动 ================= */
  if (!loadFromUrl()) {
    show("gate");
  }
})();
