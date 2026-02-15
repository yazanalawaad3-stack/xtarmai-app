(() => {
  "use strict";

  const STORAGE_KEY = "demo_trading_pro_v7";
  let SYMBOL = "BTCUSDT";

  const TF_MAP = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "2h": "2h",
    "4h": "4h",
    "6h": "6h",
    "12h": "12h",
    "1d": "1d"
  };

  const KLINE_LIMIT = 800;

  // Pool rules
  const LOSS_TO_POOL_RATE = 0.30;
  const LOSS_FEE_RATE = 0.70;
  const WIN_CAP_RATE = 0.30;
  const COLLECT_LOSS_COUNT = 2;

  const DEFAULT_STATE = {
    balance: 1000,
    pool: 0,
    phase: "collect",
    collectRemaining: COLLECT_LOSS_COUNT,
    history: [],
    lastPrice: null,
    position: null,
    candles: [],
    simPrice: null,
    markers: [],
    tf: "1m",
    chart: {
      zoom: 120,     // number of candles visible
      offset: 0,     // candles back from the latest
      sma20: true,
      sma50: false,
      ema20: false
    }
  };

  const el = (id) => document.getElementById(id);
  const nowStr = () => new Date().toLocaleString();

  const fmt = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  function normalizeDigits(s) {
    return String(s)
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  }

  function parseStake(input) {
    const s = normalizeDigits(input).replace(/[^0-9]/g, "");
    if (!s) return 0;
    const n = Number(s);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      const st = {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        candles: Array.isArray(parsed.candles) ? parsed.candles : [],
        markers: Array.isArray(parsed.markers) ? parsed.markers : []
      };
      if (!st.chart) st.chart = structuredClone(DEFAULT_STATE.chart);
      return st;
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function toast(message) {
    const n = document.createElement("div");
    n.textContent = message;
    n.style.position = "fixed";
    n.style.left = "50%";
    n.style.bottom = "18px";
    n.style.transform = "translateX(-50%)";
    n.style.padding = "10px 12px";
    n.style.borderRadius = "12px";
    n.style.border = "1px solid rgba(255,255,255,.18)";
    n.style.background = "rgba(15,22,32,.96)";
    n.style.color = "white";
    n.style.zIndex = "9999";
    n.style.maxWidth = "92vw";
    n.style.boxShadow = "0 12px 30px rgba(0,0,0,.25)";
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2200);
  }

  function ensurePhaseConsistency(state) {
    if (state.pool <= 0 && state.phase === "payout") startNewCycle(state);
    if (state.phase === "collect" && state.collectRemaining <= 0) state.phase = "payout";
  }

  function startNewCycle(state) {
    state.phase = "collect";
    state.collectRemaining = COLLECT_LOSS_COUNT;
    state.pool = 0;
  }

  function nextOutcome(state) {
    if (state.phase === "collect") return "LOSS";
    return state.pool > 0 ? "WIN" : "LOSS";
  }

  async function fetchLastPrice() {
    const url = "https://api.binance.com/api/v3/ticker/price?symbol=" + encodeURIComponent(SYMBOL);
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const p = Number(data.price);
    if (!Number.isFinite(p)) throw new Error("Invalid price");
    return p;
  }

  async function fetchKlines(tf) {
    const interval = TF_MAP[tf] || "1m";
    const url =
      "https://api.binance.com/api/v3/klines?symbol=" +
      encodeURIComponent(SYMBOL) +
      "&interval=" +
      encodeURIComponent(interval) +
      "&limit=" +
      String(KLINE_LIMIT);
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    return data.map((k) => ({
      t: Math.floor(k[0] / 1000),
      o: Number(k[1]),
      h: Number(k[2]),
      l: Number(k[3]),
      c: Number(k[4])
    })).filter((c) => Number.isFinite(c.o) && Number.isFinite(c.h) && Number.isFinite(c.l) && Number.isFinite(c.c));
  }

  // Indicators
  function sma(values, period) {
    const out = Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function ema(values, period) {
    const out = Array(values.length).fill(null);
    const k = 2 / (period + 1);
    let prev = null;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (prev == null) {
        prev = v;
        out[i] = null;
      } else {
        prev = v * k + prev * (1 - k);
        out[i] = prev;
      }
    }
    return out;
  }

  // --- Canvas chart core ---
  const chart = {
    canvas: null,
    ctx: null,
    w: 0,
    h: 0,
    dpr: 1,
    P: { l: 52, r: 14, t: 56, b: 28 },
    drag: { active: false, x0: 0, offset0: 0 },
    cross: { active: false, x: 0, y: 0 }
  };

  function resizeCanvas() {
    const canvas = chart.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    chart.dpr = dpr;

    chart.w = Math.max(320, Math.floor(rect.width));
    chart.h = Math.max(260, Math.floor(rect.height));

    canvas.width = chart.w * dpr;
    canvas.height = chart.h * dpr;
    chart.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawLineSeries(ctx, xs, ys, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < xs.length; i++) {
      const y = ys[i];
      if (y == null) continue;
      const x = xs[i];
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (started) ctx.stroke();
  }

  function drawChart(state) {
    const ctx = chart.ctx;
    if (!ctx) return;
    const { w, h, P } = chart;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(0, 0, w, h);

    const candles = state.candles || [];
    if (candles.length < 10) {
      ctx.fillStyle = "rgba(231,238,247,0.8)";
      ctx.font = "13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText("Loading candles...", P.l, P.t + 18);
      return;
    }

    const plotW = w - P.l - P.r;
    const plotH = h - P.t - P.b;

    const zoomN = Math.max(40, Math.min(260, Math.floor(state.chart.zoom || 120)));
    const maxOffset = Math.max(0, candles.length - zoomN);
    state.chart.offset = Math.max(0, Math.min(maxOffset, Math.floor(state.chart.offset || 0)));

    const start = Math.max(0, candles.length - zoomN - state.chart.offset);
    const view = candles.slice(start, start + zoomN);

    let minP = Infinity;
    let maxP = -Infinity;
    for (const c of view) {
      minP = Math.min(minP, c.l);
      maxP = Math.max(maxP, c.h);
    }
    if (state.simPrice != null) {
      minP = Math.min(minP, state.simPrice);
      maxP = Math.max(maxP, state.simPrice);
    }

    const pad = (maxP - minP) * 0.08;
    minP -= pad;
    maxP += pad;

    const yOf = (price) => P.t + (maxP - price) * (plotH / (maxP - minP));

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = P.t + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(P.l, y);
      ctx.lineTo(w - P.r, y);
      ctx.stroke();
    }

    // y labels
    ctx.fillStyle = "rgba(155,176,195,0.9)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace";
    for (let i = 0; i <= 4; i++) {
      const price = maxP - ((maxP - minP) * i) / 4;
      const y = P.t + (plotH * i) / 4;
      ctx.fillText(price.toFixed(2), 8, y + 4);
    }

    const xStep = plotW / view.length;
    const bodyW = Math.max(2, Math.floor(xStep * 0.62));
    const xs = [];
    const closes = view.map((c) => c.c);

    // candles
    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      const xCenter = P.l + i * xStep + xStep / 2;
      const xLeft = Math.floor(xCenter - bodyW / 2);

      const up = c.c >= c.o;
      const color = up ? "rgba(46,230,166,0.95)" : "rgba(255,92,119,0.95)";
      const wickColor = up ? "rgba(46,230,166,0.75)" : "rgba(255,92,119,0.75)";

      const yO = yOf(c.o);
      const yC = yOf(c.c);
      const yH = yOf(c.h);
      const yL = yOf(c.l);

      // wick
      ctx.strokeStyle = wickColor;
      ctx.beginPath();
      ctx.moveTo(xCenter, yH);
      ctx.lineTo(xCenter, yL);
      ctx.stroke();

      // body
      const top = Math.min(yO, yC);
      const bot = Math.max(yO, yC);
      const bodyH = Math.max(1, bot - top);

      ctx.fillStyle = color;
      ctx.fillRect(xLeft, top, bodyW, bodyH);

      xs.push(xCenter);
    }

    // symbol apply
    const symInput = document.getElementById("symInput");
    const symApplyBtn = document.getElementById("symApplyBtn");
    if (symInput) symInput.value = SYMBOL;
    function applySymbol() {
      if (!symInput) return;
      const v = String(symInput.value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!v) return;
      SYMBOL = v;
      // reset view when switching symbol
      state.tf = state.tf || "1m";
      state.chart.offset = 0;
      state.markers = [];
      saveState(state);
      renderUI(state);
      refreshMarket(state);
      toast("Symbol set to " + SYMBOL);
    }
    if (symApplyBtn) symApplyBtn.addEventListener("click", (e) => { e.preventDefault(); applySymbol(); });
    if (symInput) symInput.addEventListener("keydown", (e) => { if (e.key === "Enter") applySymbol(); });

    // indicators
    const sma20 = state.chart.sma20 ? sma(closes, 20) : null;
    const sma50 = state.chart.sma50 ? sma(closes, 50) : null;
    const ema20 = state.chart.ema20 ? ema(closes, 20) : null;

    const ySma20 = sma20 ? sma20.map((v) => (v == null ? null : yOf(v))) : null;
    const ySma50 = sma50 ? sma50.map((v) => (v == null ? null : yOf(v))) : null;
    const yEma20 = ema20 ? ema20.map((v) => (v == null ? null : yOf(v))) : null;

    if (ySma20) drawLineSeries(ctx, xs, ySma20, "rgba(75,211,255,0.85)");
    if (ySma50) drawLineSeries(ctx, xs, ySma50, "rgba(255,255,255,0.55)");
    if (yEma20) drawLineSeries(ctx, xs, yEma20, "rgba(255,215,105,0.70)");

    // markers (last 25)
    const marks = (state.markers || []).slice(-25);
    for (const m of marks) {
      const idx = view.findIndex((c) => c.t >= m.ts);
      if (idx < 0) continue;
      const x = P.l + idx * xStep + xStep / 2;
      const y = yOf(m.price);

      ctx.fillStyle = "rgba(75,211,255,0.95)";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(231,238,247,0.92)";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace";
      ctx.fillText(m.text, x + 8, y - 8);
    }

    // sim price line
    if (state.simPrice != null) {
      const y = yOf(state.simPrice);
      ctx.strokeStyle = "rgba(75,211,255,0.45)";
      ctx.beginPath();
      ctx.moveTo(P.l, y);
      ctx.lineTo(w - P.r, y);
      ctx.stroke();

      ctx.fillStyle = "rgba(75,211,255,0.92)";
      ctx.fillText(state.simPrice.toFixed(2), w - P.r - 92, y - 6);
    }

    // crosshair
    if (chart.cross.active) {
      const x = chart.cross.x;
      const y = chart.cross.y;
      if (x >= P.l && x <= w - P.r && y >= P.t && y <= h - P.b) {
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.moveTo(P.l, y);
        ctx.lineTo(w - P.r, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, P.t);
        ctx.lineTo(x, h - P.b);
        ctx.stroke();
      }
    }
  }

  // --- UI rendering ---
  function renderUI(state) {
    el("symbol").textContent = SYMBOL;
    el("balance").textContent = fmt(state.balance);
    el("pool").textContent = fmt(state.pool);
    el("nextOutcome").textContent = nextOutcome(state);
    el("lastPrice").textContent = state.lastPrice == null ? "—" : fmt(state.lastPrice);

    const hasPos = !!state.position;
    el("noPos").classList.toggle("hidden", hasPos);
    el("posBox").classList.toggle("hidden", !hasPos);

    if (hasPos) {
      el("posSide").textContent = state.position.side;
      el("posEntry").textContent = state.position.entryPrice == null ? "—" : fmt(state.position.entryPrice);
      el("posStake").textContent = fmt(state.position.stake);
      el("posTimer").textContent = state.position.remaining + "s";
    }

    // indicator checkboxes
    el("sma20").checked = !!state.chart.sma20;
    el("sma50").checked = !!state.chart.sma50;
    el("ema20").checked = !!state.chart.ema20;

    // timeframe active is handled by tfSelect
    const tfSelect = document.getElementById("tfSelect");
    if (tfSelect) tfSelect.value = state.tf;
    const tfBtn = document.getElementById("tfBtn");
    if (tfBtn) tfBtn.textContent = state.tf;

    // history
    const tbody = el("histBody");
    tbody.innerHTML = "";
    if (!state.history.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.className = "muted";
      td.textContent = "No trades yet.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      state.history.slice().reverse().forEach((h, i) => {
        const tr = document.createElement("tr");
        const cells = [
          String(state.history.length - i),
          h.time,
          h.side,
          fmt(h.stake),
          h.outcome,
          fmt(h.payout),
          fmt(h.fee),
          fmt(h.balanceAfter)
        ];
        for (const c of cells) {
          const td = document.createElement("td");
          td.textContent = c;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });
    }
  }

  // --- Trading actions ---
  function openPosition(state, side) {
    if (state.position) return toast("Close the current position first.");

    let stake = parseStake(el("stake").value);
    if (stake <= 0) return toast("Stake must be greater than 0.");

    if (stake > state.balance) {
      stake = Math.floor(state.balance);
      if (stake <= 0) return toast("Insufficient balance.");
      el("stake").value = String(stake);
      toast("Stake adjusted to available balance.");
    }

    const duration = Number(el("duration").value);
    if (!Number.isFinite(duration) || duration <= 0) return toast("Invalid duration.");

    ensurePhaseConsistency(state);

    const entry = state.simPrice ?? state.lastPrice ?? state.candles[state.candles.length - 1]?.c ?? null;
    if (entry == null) return toast("Price not ready.");

    state.position = { side, stake, duration, remaining: duration, entryPrice: entry };

    const ts = Math.floor(Date.now() / 1000);
    state.markers.push({ ts, price: entry, text: side + " ENTRY" });

    saveState(state);
    renderUI(state);
    drawChart(state);
  }

  function settleLoss(state, side, stake) {
    const fee = stake * LOSS_FEE_RATE;
    const toPool = stake * LOSS_TO_POOL_RATE;
    state.balance -= stake;
    state.pool += toPool;

    state.collectRemaining -= 1;
    if (state.collectRemaining <= 0) state.phase = "payout";

    state.history.push({ time: nowStr(), side, stake, outcome: "LOSS", payout: 0, fee, balanceAfter: state.balance });
  }

  function settleWin(state, side, stake) {
    const capByStake = stake * WIN_CAP_RATE;
    const payout = Math.min(capByStake, state.pool);

    state.balance += payout;
    state.pool -= payout;
    if (state.pool < 0.01) state.pool = 0;
    if (state.pool === 0) startNewCycle(state);

    state.history.push({ time: nowStr(), side, stake, outcome: "WIN", payout, fee: 0, balanceAfter: state.balance });
  }

  function animateExit(state, outcome) {
    // Make exit look natural: move simPrice smoothly over ~1.8s, not a jump.
    const pos = state.position;
    if (!pos) return;

    const entry = pos.entryPrice;
    const base = state.lastPrice ?? entry;

    // target move small and noisy
    const baseStep = base * 0.0008; // 0.08%
    const noise = (Math.random() - 0.5) * baseStep * 0.6;

    const wantUp = (pos.side === "BUY" && outcome === "WIN") || (pos.side === "SELL" && outcome === "LOSS");
    const target = entry + (wantUp ? baseStep : -baseStep) + noise;

    const start = state.simPrice ?? entry;
    const dur = 1800;
    const t0 = performance.now();

    function tick(t) {
      const k = Math.min(1, (t - t0) / dur);
      // ease out
      const e = 1 - Math.pow(1 - k, 3);
      state.simPrice = start + (target - start) * e;

      saveState(state);
      drawChart(state);

      if (k < 1) requestAnimationFrame(tick);
      else {
        const ts = Math.floor(Date.now() / 1000);
        state.markers.push({ ts, price: state.simPrice, text: outcome + " EXIT" });
        saveState(state);
        drawChart(state);
      }
    }
    requestAnimationFrame(tick);
  }

  function closePosition(state) {
    if (!state.position) return;

    ensurePhaseConsistency(state);

    const { side, stake } = state.position;
    let outcome;

    if (state.phase === "collect") {
      outcome = "LOSS";
      settleLoss(state, side, stake);
    } else {
      if (state.pool <= 0) {
        startNewCycle(state);
        outcome = "LOSS";
        settleLoss(state, side, stake);
      } else {
        outcome = "WIN";
        settleWin(state, side, stake);
      }
    }

    animateExit(state, outcome);

    state.position = null;
    if (state.history.length > 350) state.history.shift();

    saveState(state);
    renderUI(state);
    drawChart(state);
    toast(outcome);
  }

  // --- Timers and market refresh ---
  function startTimerLoop(state) {
    setInterval(() => {
      if (!state.position) return;
      state.position.remaining -= 1;
      if (state.position.remaining <= 0) {
        closePosition(state);
        return;
      }
      saveState(state);
      renderUI(state);
    }, 1000);
  }

  function startSimTicker(state) {
    setInterval(() => {
      const base = state.lastPrice ?? state.candles[state.candles.length - 1]?.c ?? null;
      if (base == null) return;

      if (state.simPrice == null) state.simPrice = base;

      // random walk
      const amp = base * 0.00025; // 0.025%
      const delta = (Math.random() - 0.5) * 2 * amp;
      state.simPrice = Math.max(0, state.simPrice + delta);

      saveState(state);
      drawChart(state);
    }, 520);
  }

  async function refreshMarket(state) {
    try {
      const [p, ks] = await Promise.all([fetchLastPrice(), fetchKlines(state.tf)]);
      state.lastPrice = p;
      state.candles = ks;
      if (!state.position) state.simPrice = p;

      saveState(state);
      renderUI(state);
      drawChart(state);
    } catch {
      // ignore
    }
  }

  // --- Interactions: zoom/pan/crosshair, touch support ---
  function bindChartInteractions(state) {
    const canvas = chart.canvas;

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const dir = Math.sign(e.deltaY);
      const z = state.chart.zoom || 120;
      const next = dir > 0 ? z + 10 : z - 10;
      state.chart.zoom = Math.max(40, Math.min(260, next));
      saveState(state);
      drawChart(state);
    }, { passive: false });

    canvas.addEventListener("mousedown", (e) => {
      chart.drag.active = true;
      chart.drag.x0 = e.clientX;
      chart.drag.offset0 = state.chart.offset || 0;
    });

    window.addEventListener("mouseup", () => { chart.drag.active = false; });

    window.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      chart.cross.active = true;
      chart.cross.x = x;
      chart.cross.y = y;

      if (chart.drag.active) {
        const dx = e.clientX - chart.drag.x0;
        const z = Math.max(40, Math.min(260, Math.floor(state.chart.zoom || 120)));
        const plotW = rect.width - chart.P.l - chart.P.r;
        const candlesPerPx = z / Math.max(1, plotW);
        const shift = Math.round(-dx * candlesPerPx);
        state.chart.offset = Math.max(0, chart.drag.offset0 + shift);
      }

      saveState(state);
      drawChart(state);
    });

    canvas.addEventListener("mouseleave", () => {
      chart.cross.active = false;
      drawChart(state);
    });

    // Touch: pan with one finger, pinch zoom with two
    let tMode = null;
    let tStart = null;

    canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        tMode = "pan";
        tStart = { x: e.touches[0].clientX, offset0: state.chart.offset || 0, zoom: state.chart.zoom || 120 };
      } else if (e.touches.length === 2) {
        tMode = "pinch";
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        tStart = { dist: Math.hypot(dx, dy), zoom: state.chart.zoom || 120 };
      }
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
      if (!tMode || !tStart) return;

      if (tMode === "pan" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - tStart.x;
        const rect = canvas.getBoundingClientRect();
        const plotW = rect.width - chart.P.l - chart.P.r;
        const z = Math.max(40, Math.min(260, Math.floor(state.chart.zoom || 120)));
        const candlesPerPx = z / Math.max(1, plotW);
        const shift = Math.round(-dx * candlesPerPx);
        state.chart.offset = Math.max(0, tStart.offset0 + shift);
        saveState(state);
        drawChart(state);
      }

      if (tMode === "pinch" && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const ratio = dist / Math.max(10, tStart.dist);
        const z = Math.floor(tStart.zoom / ratio);
        state.chart.zoom = Math.max(40, Math.min(260, z));
        saveState(state);
        drawChart(state);
      }
    }, { passive: true });

    canvas.addEventListener("touchend", () => {
      tMode = null;
      tStart = null;
    }, { passive: true });
  }

  function setTimeframe(state, tf) {
    if (!TF_MAP[tf]) return;
    state.tf = tf;
    state.chart.offset = 0;
    saveState(state);
    renderUI(state);
    refreshMarket(state);
  }

  function setFullscreen(on) {
    const inner = document.querySelector(".chartInner");
    if (!inner) return;
    inner.classList.toggle("fullscreen", on);
    document.body.classList.toggle("fsLock", on);
    document.body.classList.toggle("fsMode", on);
    resizeCanvas();
  }

  function initChart(state) {
    chart.canvas = el("chartCanvas");
    chart.ctx = chart.canvas.getContext("2d");

    const ro = new ResizeObserver(() => {
      resizeCanvas();
      drawChart(state);
    });
    ro.observe(chart.canvas);

    resizeCanvas();
    bindChartInteractions(state);
    drawChart(state);
  }

  function bindControls(state) {
    // timeframe dropdown
    const tfBtn = document.getElementById("tfBtn");
    const tfMenu = document.getElementById("tfMenu");
    const tfSelect = document.getElementById("tfSelect");

    function closeTfMenu() { tfMenu.classList.add("hidden"); }
    function toggleTfMenu() { tfMenu.classList.toggle("hidden"); }

    tfBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleTfMenu(); });
    document.addEventListener("click", () => closeTfMenu());

    tfSelect.value = state.tf;
    tfSelect.addEventListener("change", () => {
      setTimeframe(state, tfSelect.value);
      closeTfMenu();
    });

    // symbol apply
    const symInput = document.getElementById("symInput");
    const symApplyBtn = document.getElementById("symApplyBtn");
    if (symInput) symInput.value = SYMBOL;
    function applySymbol() {
      if (!symInput) return;
      const v = String(symInput.value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!v) return;
      SYMBOL = v;
      // reset view when switching symbol
      state.tf = state.tf || "1m";
      state.chart.offset = 0;
      state.markers = [];
      saveState(state);
      renderUI(state);
      refreshMarket(state);
      toast("Symbol set to " + SYMBOL);
    }
    if (symApplyBtn) symApplyBtn.addEventListener("click", (e) => { e.preventDefault(); applySymbol(); });
    if (symInput) symInput.addEventListener("keydown", (e) => { if (e.key === "Enter") applySymbol(); });

    // indicators
    el("sma20").addEventListener("change", () => { state.chart.sma20 = el("sma20").checked; saveState(state); drawChart(state); });
    el("sma50").addEventListener("change", () => { state.chart.sma50 = el("sma50").checked; saveState(state); drawChart(state); });
    el("ema20").addEventListener("change", () => { state.chart.ema20 = el("ema20").checked; saveState(state); drawChart(state); });

    el("resetViewBtn").addEventListener("click", () => {
      state.chart.zoom = 120;
      state.chart.offset = 0;
      saveState(state);
      drawChart(state);
    });

    let fs = false;
    el("fsBtn").addEventListener("click", () => {
      fs = !fs;
      setFullscreen(fs);
      el("fsBtn").textContent = fs ? "Exit" : "Fullscreen";
      drawChart(state);
    });

    // existing side panel buttons
    el("buyBtn").addEventListener("click", () => openPosition(state, "BUY"));
    el("sellBtn").addEventListener("click", () => openPosition(state, "SELL"));
    el("closeNowBtn").addEventListener("click", () => closePosition(state));
    el("refreshBtn").addEventListener("click", () => refreshMarket(state));

    // fullscreen trade bar buttons
    el("buyBtnFs").addEventListener("click", () => openPosition(state, "BUY"));
    el("sellBtnFs").addEventListener("click", () => openPosition(state, "SELL"));
    el("closeBtnFs").addEventListener("click", () => closePosition(state));

    el("stake").addEventListener("input", () => {
      const before = el("stake").value;
      const normalized = normalizeDigits(before);
      if (normalized !== before) el("stake").value = normalized;
    });

    el("resetBtn").addEventListener("click", () => {
      Object.assign(state, structuredClone(DEFAULT_STATE));
      saveState(state);
      renderUI(state);
      drawChart(state);
      toast("Demo reset.");
    });
  }

  function patchRulesText() {
    const rules = document.querySelector(".rules ul");
    if (!rules) return;
    rules.innerHTML = "";
    const items = [
      "Cycle: 2x LOSS (collect) then WIN payouts until Pool is empty",
      "LOSS: balance -= stake; Pool += 30% of stake; fee = 70% of stake",
      "WIN: payout = min(30% of stake, Pool); Pool -= payout",
      "When Pool reaches 0: cycle restarts (collect 2 losses again)"
    ];
    for (const t of items) {
      const li = document.createElement("li");
      li.textContent = t;
      rules.appendChild(li);
    }
  }

  function init() {
    const state = loadState();
    ensurePhaseConsistency(state);

    patchRulesText();
    renderUI(state);

    initChart(state);
    bindControls(state);

    refreshMarket(state);
    setInterval(() => refreshMarket(state), 12_000);

    startTimerLoop(state);
    startSimTicker(state);
  }

  document.addEventListener("DOMContentLoaded", init);
})();