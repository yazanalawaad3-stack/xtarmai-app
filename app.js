(() => {
  "use strict";

  const STORAGE_KEY = "demo_trading_pro_v6";
  const SYMBOL = "BTCUSDT";
  const INTERVAL = "1m";
  const KLINE_LIMIT = 140;

  // Pool rules (as agreed)
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
    // chart related
    candles: [],
    simPrice: null,
    markers: [] // {ts, type, price, text}
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
      return {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        candles: Array.isArray(parsed.candles) ? parsed.candles : [],
        markers: Array.isArray(parsed.markers) ? parsed.markers : []
      };
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
    setTimeout(() => n.remove(), 2400);
  }

  function ensurePhaseConsistency(state) {
    if (state.pool <= 0 && state.phase === "payout") {
      startNewCycle(state);
    }
    if (state.phase === "collect" && state.collectRemaining <= 0) {
      state.phase = "payout";
    }
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

  async function fetchKlines() {
    const url =
      "https://api.binance.com/api/v3/klines?symbol=" +
      encodeURIComponent(SYMBOL) +
      "&interval=" +
      encodeURIComponent(INTERVAL) +
      "&limit=" +
      String(KLINE_LIMIT);
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    // [ openTime, open, high, low, close, volume, closeTime, ... ]
    return data.map((k) => ({
      t: Math.floor(k[0] / 1000),
      o: Number(k[1]),
      h: Number(k[2]),
      l: Number(k[3]),
      c: Number(k[4])
    })).filter((c) => Number.isFinite(c.o) && Number.isFinite(c.h) && Number.isFinite(c.l) && Number.isFinite(c.c));
  }

  // --- Canvas chart ---
  const chart = {
    canvas: null,
    ctx: null,
    w: 0,
    h: 0,
    dpr: 1,
    padding: { l: 46, r: 12, t: 16, b: 26 }
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

  function drawChart(state) {
    const ctx = chart.ctx;
    if (!ctx) return;

    const { w, h, padding: P } = chart;
    ctx.clearRect(0, 0, w, h);

    // background
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(0, 0, w, h);

    const candles = state.candles || [];
    if (candles.length < 5) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "13px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText("Loading candles...", P.l, P.t + 18);
      return;
    }

    const plotW = w - P.l - P.r;
    const plotH = h - P.t - P.b;

    // visible last N
    const N = Math.min(120, candles.length);
    const view = candles.slice(candles.length - N);

    let minP = Infinity;
    let maxP = -Infinity;
    for (const c of view) {
      minP = Math.min(minP, c.l);
      maxP = Math.max(maxP, c.h);
    }

    // include simPrice (last moving price) for scaling
    if (state.simPrice != null) {
      minP = Math.min(minP, state.simPrice);
      maxP = Math.max(maxP, state.simPrice);
    }

    const pad = (maxP - minP) * 0.06;
    minP -= pad;
    maxP += pad;

    const yOf = (price) => P.t + (maxP - price) * (plotH / (maxP - minP));
    const xStep = plotW / N;
    const bodyW = Math.max(2, Math.floor(xStep * 0.6));

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

    // price labels (left)
    ctx.fillStyle = "rgba(155,176,195,0.9)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace";
    for (let i = 0; i <= 4; i++) {
      const price = maxP - ((maxP - minP) * i) / 4;
      const y = P.t + (plotH * i) / 4;
      ctx.fillText(price.toFixed(2), 6, y + 4);
    }

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
    }

    // markers (last ~20)
    const marks = (state.markers || []).slice(-20);
    for (const m of marks) {
      // find nearest candle index
      const idx = view.findIndex((c) => c.t >= m.ts);
      if (idx < 0) continue;
      const x = P.l + idx * xStep + xStep / 2;
      const y = yOf(m.price);

      ctx.fillStyle = "rgba(75,211,255,0.95)";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(231,238,247,0.95)";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace";
      ctx.fillText(m.text, x + 8, y - 8);
    }

    // sim price line
    if (state.simPrice != null) {
      const y = yOf(state.simPrice);
      ctx.strokeStyle = "rgba(75,211,255,0.55)";
      ctx.beginPath();
      ctx.moveTo(P.l, y);
      ctx.lineTo(w - P.r, y);
      ctx.stroke();

      ctx.fillStyle = "rgba(75,211,255,0.9)";
      ctx.fillText(state.simPrice.toFixed(2), w - P.r - 90, y - 6);
    }
  }

  // --- Trading / position logic ---
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

  function openPosition(state, side) {
    if (state.position) return toast("Close the current position first.");

    let stake = parseStake(el("stake").value);
    if (stake <= 0) return toast("Stake must be greater than 0.");

    // Allow all-in if stake > balance
    if (stake > state.balance) {
      stake = Math.floor(state.balance);
      if (stake <= 0) return toast("Insufficient balance.");
      el("stake").value = String(stake);
      toast("Stake adjusted to available balance.");
    }

    const duration = Number(el("duration").value);
    if (!Number.isFinite(duration) || duration <= 0) return toast("Invalid duration.");

    ensurePhaseConsistency(state);

    const entry = state.simPrice ?? state.lastPrice;
    state.position = {
      side,
      stake,
      duration,
      remaining: duration,
      entryPrice: entry
    };

    const ts = Math.floor(Date.now() / 1000);
    state.markers.push({ ts, type: "entry", price: entry, text: side + " ENTRY" });

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

    state.history.push({
      time: nowStr(),
      side,
      stake,
      outcome: "LOSS",
      payout: 0,
      fee,
      balanceAfter: state.balance
    });
  }

  function settleWin(state, side, stake) {
    const capByStake = stake * WIN_CAP_RATE;
    const payout = Math.min(capByStake, state.pool);

    state.balance += payout;
    state.pool -= payout;
    if (state.pool < 0.01) state.pool = 0;

    // When pool is empty -> restart cycle (collect 2 losses again)
    if (state.pool === 0) startNewCycle(state);

    state.history.push({
      time: nowStr(),
      side,
      stake,
      outcome: "WIN",
      payout,
      fee: 0,
      balanceAfter: state.balance
    });
  }

  function applyOutcomeToVisualPrice(state, outcome) {
    // Force a small move that matches outcome and side so it looks like a real chart result.
    // This affects only the overlay simPrice, not historical candles.
    const pos = state.position;
    if (!pos) return;

    const entry = pos.entryPrice ?? state.simPrice ?? state.lastPrice ?? 0;
    let exit = entry;

    const step = entry * 0.0015; // 0.15% move
    const upMove = step;
    const downMove = -step;

    const wantUp = (pos.side === "BUY" && outcome === "WIN") || (pos.side === "SELL" && outcome === "LOSS");
    exit = entry + (wantUp ? upMove : downMove);

    state.simPrice = exit;

    const ts = Math.floor(Date.now() / 1000);
    state.markers.push({ ts, type: "exit", price: exit, text: outcome + " EXIT" });
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

    applyOutcomeToVisualPrice(state, outcome);

    // Cleanup
    state.position = null;
    if (state.history.length > 300) state.history.shift();

    saveState(state);
    renderUI(state);
    drawChart(state);
    toast(outcome);
  }

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
      drawChart(state);
    }, 1000);
  }

  function startSimTicker(state) {
    // Smooth moving overlay price, for a "live" feel on mobile too.
    setInterval(() => {
      const base = state.lastPrice ?? (state.candles.length ? state.candles[state.candles.length - 1].c : null);
      if (base == null) return;

      if (state.simPrice == null) state.simPrice = base;

      // random walk (small)
      const amp = base * 0.00035; // 0.035%
      const delta = (Math.random() - 0.5) * 2 * amp;

      // if position open, keep it slightly dynamic
      state.simPrice = Math.max(0, state.simPrice + delta);

      saveState(state);
      drawChart(state);
    }, 700);
  }

  async function refreshMarket(state) {
    try {
      const [p, ks] = await Promise.all([fetchLastPrice(), fetchKlines()]);
      state.lastPrice = p;
      state.candles = ks;

      // Keep simPrice close to market when no open position
      if (!state.position) {
        state.simPrice = p;
      }

      saveState(state);
      renderUI(state);
      drawChart(state);
    } catch {
      // ignore
    }
  }

  function initChart(state) {
    chart.canvas = el("chartCanvas");
    chart.ctx = chart.canvas.getContext("2d");

    const ro = new ResizeObserver(() => {
      resizeCanvas();
      drawChart(state);
    });
    ro.observe(chart.canvas);

    // initial size
    resizeCanvas();
    drawChart(state);
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

  function bindUI(state) {
    el("stake").addEventListener("input", () => {
      const before = el("stake").value;
      const normalized = normalizeDigits(before);
      if (normalized !== before) el("stake").value = normalized;
    });

    el("buyBtn").addEventListener("click", () => openPosition(state, "BUY"));
    el("sellBtn").addEventListener("click", () => openPosition(state, "SELL"));
    el("closeNowBtn").addEventListener("click", () => closePosition(state));

    el("resetBtn").addEventListener("click", () => {
      Object.assign(state, structuredClone(DEFAULT_STATE));
      saveState(state);
      patchRulesText();
      renderUI(state);
      drawChart(state);
      toast("Demo reset.");
    });

    el("refreshBtn").addEventListener("click", () => refreshMarket(state));
  }

  function init() {
    const state = loadState();
    ensurePhaseConsistency(state);
    patchRulesText();
    renderUI(state);

    initChart(state);
    bindUI(state);

    refreshMarket(state);
    setInterval(() => refreshMarket(state), 10_000);

    startTimerLoop(state);
    startSimTicker(state);
  }

  document.addEventListener("DOMContentLoaded", init);
})();