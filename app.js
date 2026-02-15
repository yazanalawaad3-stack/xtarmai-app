(() => {
  "use strict";

  const STORAGE_KEY = "demo_trading_pro_v3";
  const SYMBOL = "BTCUSDT";

  const DEFAULT_STATE = {
    balance: 1000,
    pool: 0,
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

  function render(state) {
    el("symbol").textContent = SYMBOL;
    el("balance").textContent = fmt(state.balance);
    el("pool").textContent = fmt(state.pool);
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
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2400);
  }

  function openPosition(state, side) {
    if (state.position) return toast("Close current position first.");
    const stake = parseStake(el("stake").value);
    if (stake <= 0) return toast("Invalid stake.");
    if (stake > state.balance) return toast("Insufficient balance.");

    const duration = Number(el("duration").value);
    state.position = {
      side,
      stake,
      remaining: duration,
      entryPrice: state.lastPrice
    };
    saveState(state);
    render(state);
  }

  function settleTrade(state, side, stake, isWin) {
    let payout = 0;

    if (!isWin) {
      state.balance -= stake;
      state.pool += stake;
    } else {
      const capByStake = stake * 0.30;
      const capByPool = state.pool * 0.30;
      payout = Math.min(capByStake, capByPool);
      state.balance += payout;
      state.pool -= payout;
      if (state.pool < 0.01) state.pool = 0;
    }

    state.history.push({
      time: nowStr(),
      side,
      stake,
      outcome: isWin ? "WIN" : "LOSS",
      payout,
      balanceAfter: state.balance
    });
    if (state.history.length > 200) state.history.shift();
  }

  function closePosition(state) {
    if (!state.position) return;
    const { side, stake } = state.position;

    // Demo logic: alternate outcomes based on pool size (simple & fair)
    const isWin = state.pool > 0 && Math.random() < 0.5;

    settleTrade(state, side, stake, isWin);
    state.position = null;
    saveState(state);
    render(state);
    toast(isWin ? "WIN" : "LOSS");
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
    } catch {}
  }

  function init() {
    const state = loadState();

    el("stake").addEventListener("input", () => {
      const v = normalizeDigits(el("stake").value);
      el("stake").value = v;
    });

    el("buyBtn").onclick = () => openPosition(state, "BUY");
    el("sellBtn").onclick = () => openPosition(state, "SELL");
    el("closeNowBtn").onclick = () => closePosition(state);
    el("resetBtn").onclick = () => {
      Object.assign(state, structuredClone(DEFAULT_STATE));
      saveState(state);
      render(state);
      toast("Demo reset.");
    };
    el("refreshBtn").onclick = () => refreshPrice(state);

    render(state);
    refreshPrice(state);
    startTimer(state);
    setInterval(() => refreshPrice(state), 5000);
  }

  document.addEventListener("DOMContentLoaded", init);
})();