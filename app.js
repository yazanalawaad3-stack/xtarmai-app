(() => {
  "use strict";

  const STORAGE_KEY = "demo_trading_pro_v2";
  const SYMBOL = "BTCUSDT";

  // Fixed sequence: LOSS, LOSS, WIN (repeat)
  const SEQ = ["LOSS", "LOSS", "WIN"];

  const DEFAULT_STATE = {
    balance: 1000,
    // Pool is the sum of the last two LOSS stakes (full stake amounts)
    pool: 0,
    step: 0,
    history: [],
    lastPrice: null,
    lastUpdatedAt: null,
    position: null,
    lastTwoLosses: [] // array of stakes (max length 2)
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
        history: Array.isArray(parsed.history) ? parsed.history : [],
        lastTwoLosses: Array.isArray(parsed.lastTwoLosses) ? parsed.lastTwoLosses : []
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function nextOutcome(state) {
    return SEQ[state.step % SEQ.length];
  }

  function setText(id, v) {
    const node = el(id);
    if (node) node.textContent = v;
  }

  function recomputePool(state) {
    const sum = state.lastTwoLosses.reduce((a, b) => a + Number(b || 0), 0);
    state.pool = Number.isFinite(sum) ? sum : 0;
  }

  function render(state) {
    setText("symbol", SYMBOL);
    setText("balance", fmt(state.balance));
    setText("pool", fmt(state.pool));
    setText("nextOutcome", nextOutcome(state));
    setText("lastPrice", state.lastPrice == null ? "—" : fmt(state.lastPrice));

    const hasPos = !!state.position;
    el("noPos").classList.toggle("hidden", hasPos);
    el("posBox").classList.toggle("hidden", !hasPos);

    if (hasPos) {
      setText("posSide", state.position.side);
      setText("posEntry", state.position.entryPrice == null ? "—" : fmt(state.position.entryPrice));
      setText("posStake", fmt(state.position.stake));
      setText("posTimer", state.position.remaining + "s");
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
    const res = await fetch(url, { method: "GET" });
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
    n.style.border = "1px solid rgba(255,255,255,.18)";
    n.style.background = "rgba(15,22,32,.96)";
    n.style.color = "white";
    n.style.zIndex = "9999";
    n.style.maxWidth = "92vw";
    n.style.boxShadow = "0 12px 30px rgba(0,0,0,.25)";
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2600);
  }

  function openPosition(state, side) {
    if (state.position) {
      toast("Close the current position first.");
      return;
    }

    const stake = parseStake(el("stake").value);
    if (stake <= 0) return toast("Stake must be greater than 0.");
    if (stake > state.balance) return toast("Insufficient balance.");

    const duration = Number(el("duration").value);
    if (!Number.isFinite(duration) || duration <= 0) return toast("Invalid duration.");

    state.position = {
      side,
      stake,
      duration,
      remaining: duration,
      entryPrice: state.lastPrice
    };

    saveState(state);
    render(state);
  }

  function settleTrade(state, side, stake, outcome) {
    let payout = 0;
    let fee = 0;

    if (outcome === "LOSS") {
      // Full stake is a loss. Track only the last two losses.
      state.balance -= stake;

      state.lastTwoLosses.push(stake);
      if (state.lastTwoLosses.length > 2) state.lastTwoLosses.shift();

      recomputePool(state);
    } else {
      // WIN: user gets 30% of the sum of the last two losses, then reset.
      recomputePool(state);
      payout = state.pool * 0.30;

      state.balance += payout;

      state.lastTwoLosses = [];
      state.pool = 0;
    }

    state.step = (state.step + 1) % SEQ.length;

    state.history.push({
      time: nowStr(),
      side,
      stake,
      outcome,
      payout,
      fee,
      balanceAfter: state.balance
    });
    if (state.history.length > 200) state.history.shift();
  }

  function closePosition(state) {
    if (!state.position) return;

    const { side, stake } = state.position;
    const outcome = nextOutcome(state);

    settleTrade(state, side, stake, outcome);

    state.position = null;
    saveState(state);
    render(state);

    toast("Closed: " + outcome);
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
      render(state);
    }, 1000);
  }

  async function refreshPrice(state) {
    try {
      const p = await fetchLastPrice();
      state.lastPrice = p;
      state.lastUpdatedAt = nowStr();
      saveState(state);
      render(state);
    } catch {
      toast("Price fetch failed.");
    }
  }

  function patchRulesText() {
    // Update the rules list in the DOM (if present) to reflect the new logic.
    const rules = document.querySelector(".rules ul");
    if (!rules) return;
    rules.innerHTML = "";
    const items = [
      "Fixed sequence: LOSS, LOSS, WIN (repeat)",
      "LOSS: balance -= stake; store the stake as a loss",
      "Pool = sum of the last two losses (full stakes)",
      "WIN: payout = 30% of Pool; then Pool resets to 0"
    ];
    for (const t of items) {
      const li = document.createElement("li");
      li.textContent = t;
      rules.appendChild(li);
    }
  }

  function init() {
    const state = loadState();
    recomputePool(state);

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
    startTimerLoop(state);
    setInterval(() => refreshPrice(state), 5000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
