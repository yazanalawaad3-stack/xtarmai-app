/* Demo Trading Simulator - local only
   No real trading, no accounts, no database.
   Data is stored in localStorage.
*/
(() => {
  "use strict";

  const STORAGE_KEY = "demo_trading_state_v1";

  const DEFAULT_STATE = {
    balance: 1000,
    pool: 0,
    step: 0, // 0->L, 1->L, 2->W, repeat
    history: [],
    lastPrice: null,
    lastPriceUpdatedAt: null
  };

  const OUTCOMES = ["LOSS", "LOSS", "WIN"];

  const el = (id) => document.getElementById(id);

  const fmt = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return "0";
    return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const nowStr = () => new Date().toLocaleString();

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
    return OUTCOMES[state.step % OUTCOMES.length];
  }

  function render(state) {
    el("balance").textContent = fmt(state.balance);
    el("pool").textContent = fmt(state.pool);
    el("nextOutcome").textContent = nextOutcome(state);

    if (state.lastPrice != null) {
      el("price").textContent = fmt(state.lastPrice);
      el("updated").textContent = state.lastPriceUpdatedAt || "—";
    }

    const body = el("historyBody");
    body.innerHTML = "";
    if (!state.history.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.className = "muted";
      td.textContent = "No trades yet.";
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    state.history.slice().reverse().forEach((h, idx) => {
      const tr = document.createElement("tr");
      const cells = [
        String(state.history.length - idx),
        h.time,
        fmt(h.stake),
        h.outcome,
        fmt(h.poolDelta),
        fmt(h.payout),
        fmt(h.fee),
        fmt(h.balanceAfter)
      ];
      for (const c of cells) {
        const td = document.createElement("td");
        td.textContent = c;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    });
  }

  function clampAmount(v) {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, n);
  }

  function placeTrade(state, stake) {
    const outcome = nextOutcome(state);

    if (stake <= 0) return { ok: false, message: "Stake must be greater than 0." };
    if (stake > state.balance) return { ok: false, message: "Insufficient demo balance." };

    let poolDelta = 0;
    let payout = 0;
    let fee = 0;

    if (outcome === "LOSS") {
      const toPool = stake * 0.70;
      fee = stake * 0.30;
      poolDelta = toPool;
      state.pool += toPool;
      state.balance -= stake;
    } else {
      payout = state.pool * 0.30;
      state.balance += payout;
      poolDelta = -state.pool;
      state.pool = 0;
    }

    state.step = (state.step + 1) % OUTCOMES.length;

    const entry = {
      time: nowStr(),
      stake,
      outcome,
      poolDelta,
      payout,
      fee,
      balanceAfter: state.balance
    };

    state.history.push(entry);
    if (state.history.length > 200) state.history.shift();

    return { ok: true };
  }

  async function fetchBinancePrice(symbol = "BTCUSDT") {
    const url = "https://api.binance.com/api/v3/ticker/price?symbol=" + encodeURIComponent(symbol);
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const price = Number(data.price);
    if (!Number.isFinite(price)) throw new Error("Invalid price");
    return price;
  }

  function toast(message) {
    const n = document.createElement("div");
    n.textContent = message;
    n.style.position = "fixed";
    n.style.left = "50%";
    n.style.bottom = "18px";
    n.style.transform = "translateX(-50%)";
    n.style.padding = "10px 12px";
    n.style.borderRadius = "10px";
    n.style.border = "1px solid rgba(255,255,255,.18)";
    n.style.background = "rgba(15,22,32,.95)";
    n.style.color = "white";
    n.style.zIndex = "9999";
    n.style.maxWidth = "92vw";
    n.style.boxShadow = "0 12px 30px rgba(0,0,0,.25)";
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2600);
  }

  function init() {
    let state = loadState();
    render(state);

    el("tradeForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const stake = clampAmount(el("amount").value);
      const r = placeTrade(state, stake);
      if (!r.ok) {
        toast(r.message);
        return;
      }
      saveState(state);
      render(state);
    });

    el("resetDemo").addEventListener("click", () => {
      state = structuredClone(DEFAULT_STATE);
      saveState(state);
      render(state);
      toast("Demo reset.");
    });

    const refresh = async () => {
      try {
        const price = await fetchBinancePrice("BTCUSDT");
        state.lastPrice = price;
        state.lastPriceUpdatedAt = nowStr();
        saveState(state);
        render(state);
      } catch {
        toast("Price fetch failed. Simulator still works.");
      }
    };

    el("refreshPrice").addEventListener("click", refresh);

    // Auto refresh once on load (non-blocking).
    refresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
