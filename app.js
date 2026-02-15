(() => {
  "use strict";

  const STORAGE_KEY = "demo_trading_pro_v4";
  const SYMBOL = "BTCUSDT";

  // Parameters
  const LOSS_TO_POOL_RATE = 0.30;   // 30% goes to Pool
  const LOSS_FEE_RATE = 0.70;       // 70% is fee/burn
  const WIN_CAP_RATE = 0.30;        // Winner max = 30% of own stake
  const COLLECT_LOSS_COUNT = 2;     // First 2 trades in each cycle are LOSS (collect)

  const DEFAULT_STATE = {
    balance: 1000,
    pool: 0,
    // phase: "collect" or "payout"
    phase: "collect",
    collectRemaining: COLLECT_LOSS_COUNT,
    history: [],
    lastPrice: null,
    position: null
  };

  const el = (id) => document.getElementById(id);

  const fmt = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const nowStr = () => new Date().toLocaleString();

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
        history: Array.isArray(parsed.history) ? parsed.history : []
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function nextOutcome(state) {
    if (state.phase === "collect") return "LOSS";
    // payout phase
    return state.pool > 0 ? "WIN" : "LOSS";
  }

  function render(state) {
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
      return;
    }

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

  async function fetchLastPrice() {
    const url = "https://api.binance.com/api/v3/ticker/price?symbol=" + encodeURIComponent(SYMBOL);
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const p = Number(data.price);
    if (!Number.isFinite(p)) throw new Error("Invalid price");
    return p;
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
    n.style.background = "rgba(15,22,32,.95)";
    n.style.color = "white";
    n.style.zIndex = "9999";
    n.style.border = "1px solid rgba(255,255,255,.18)";
    n.style.boxShadow = "0 12px 30px rgba(0,0,0,.25)";
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2400);
  }

  function startNewCycle(state) {
    state.phase = "collect";
    state.collectRemaining = COLLECT_LOSS_COUNT;
    state.pool = 0;
  }

  function ensurePhaseConsistency(state) {
    if (state.pool <= 0) {
      if (state.phase === "payout") {
        startNewCycle(state);
      }
    }
    if (state.phase === "collect" && state.collectRemaining <= 0) {
      state.phase = "payout";
    }
  }

  function openPosition(state, side) {
    if (state.position) return toast("Close current position first.");

    const stake = parseStake(el("stake").value);
    if (stake <= 0) return toast("Stake must be greater than 0.");
    if (stake > state.balance) return toast("Insufficient balance.");

    const duration = Number(el("duration").value);
    if (!Number.isFinite(duration) || duration <= 0) return toast("Invalid duration.");

    ensurePhaseConsistency(state);

    state.position = {
      side,
      stake,
      remaining: duration,
      entryPrice: state.lastPrice
    };

    saveState(state);
    render(state);
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
    // payout is limited by: 30% of stake, and remaining pool
    const capByStake = stake * WIN_CAP_RATE;
    const payout = Math.min(capByStake, state.pool);

    state.balance += payout;
    state.pool -= payout;

    if (state.pool < 0.01) state.pool = 0;
    if (state.pool === 0) {
      startNewCycle(state);
    }

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

  function closePosition(state) {
    if (!state.position) return;

    ensurePhaseConsistency(state);

    const { side, stake } = state.position;

    if (state.phase === "collect") {
      settleLoss(state, side, stake);
    } else {
      if (state.pool <= 0) {
        startNewCycle(state);
        settleLoss(state, side, stake);
      } else {
        settleWin(state, side, stake);
      }
    }

    if (state.history.length > 300) state.history.shift();

    state.position = null;
    saveState(state);
    render(state);
    toast(state.history[state.history.length - 1].outcome);
  }

  function startTimer(state) {
    setInterval(() => {
      if (!state.position) return;
      state.position.remaining -= 1;
      if (state.position.remaining <= 0) closePosition(state);
      saveState(state);
      render(state);
    }, 1000);
  }

  async function refreshPrice(state) {
    try {
      state.lastPrice = await fetchLastPrice();
      saveState(state);
      render(state);
    } catch {
      // ignore
    }
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
      render(state);
      toast("Demo reset.");
    });
    el("refreshBtn").addEventListener("click", () => refreshPrice(state));

    patchRulesText();
    render(state);
    refreshPrice(state);
    startTimer(state);
    setInterval(() => refreshPrice(state), 5000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();