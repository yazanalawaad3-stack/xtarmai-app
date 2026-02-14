/* Scenario Trading Demo (Personal)
   - Live price display via Binance WebSocket (public) + REST fallback
   - Trading modes: Timed (auto close) / Open (manual close)
   - Outcomes are scenario-based and manually selected before opening.
   - PnL uses selected scenario percent, not market movement.
*/

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const state = {
    price: NaN,
    lastPriceAt: 0,
    ws: null,
    wsConnected: false,

    balance: 0,
    realizedPnl: 0,
    housePnl: 0,
    houseBalance: 0,
    positions: [], // {id, side, amount, entryPrice, openedAt, mode, closeAt, scenarioPct, scenarioName}
    trades: [],    // {time, side, amount, scenarioName, pnl}
    pendingSide: null,
  };

  function nowTs() { return Date.now(); }
  function fmt(n, d = 6) { return Number.isFinite(n) ? n.toFixed(d) : "—"; }
  function fmt2(n) { return Number.isFinite(n) ? n.toFixed(2) : "—"; }
  function uid() { return Math.random().toString(16).slice(2) + "-" + nowTs().toString(16); }

  function normalizeSymbol(sym) {
    return String(sym || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function setFeedStatus(text) { $("feedStatus").textContent = text; }

  function getFeePct() {
    const v = parseFloat($("feePct").value);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }

  function feeFor(amount) {
    const pct = getFeePct() / 100;
    return amount * pct;
  }

  // Market-only unrealized display (optional)
  function marketPnl(side, amount, entry, exit) {
    if (exit <= 0 || entry <= 0) return 0;
    if (side === "LONG") return amount * (exit / entry - 1);
    return amount * (entry / exit - 1);
  }

  function calcUnrealizedMarket() {
    let total = 0;
    for (const p of state.positions) {
      total += marketPnl(p.side, p.amount, p.entryPrice, state.price);
    }
    return total;
  }

  function renderStats() {
    $("livePrice").textContent = fmt(state.price, 6);
    $("balance").textContent = fmt2(state.balance);
    $("houseWallet").textContent = fmt2(state.houseBalance);
    $("houseTotal").textContent = (state.housePnl >= 0 ? "+" : "") + fmt2(state.housePnl);

    const u = calcUnrealizedMarket();
    $("unrealized").textContent = (u >= 0 ? "+" : "") + fmt2(u);
    $("unrealized").className = "v " + (u >= 0 ? "ok" : "bad");

    $("realized").textContent = (state.realizedPnl >= 0 ? "+" : "") + fmt2(state.realizedPnl);
    $("realized").className = "v " + (state.realizedPnl >= 0 ? "ok" : "bad");
  }

  function renderPositions() {
    const body = $("positionsBody");
    body.innerHTML = "";
    if (state.positions.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="5" class="muted">No open positions</td>';
      body.appendChild(tr);
      return;
    }

    for (const p of state.positions) {
      const tr = document.createElement("tr");
      const pill = '<span class="pill">' + (p.side === "LONG" ? "LONG" : "SHORT") + "</span>";
      const modeTxt = p.mode === "timed" ? "timed" : "open";

      const btn = document.createElement("button");
      btn.textContent = "Close";
      btn.style.padding = "6px 10px";
      btn.addEventListener("click", () => closePosition(p.id));

      tr.innerHTML = `
        <td>${pill} <span class="muted">(${modeTxt})</span></td>
        <td class="right">${fmt2(p.amount)}</td>
        <td class="right">${fmt(p.entryPrice, 6)}</td>
        <td class="right"><span class="tag">${p.scenarioName}</span></td>
        <td class="right"></td>
      `;
      tr.children[4].appendChild(btn);
      body.appendChild(tr);
    }
  }

  function renderTrades() {
    const body = $("tradesBody");
    body.innerHTML = "";
    if (state.trades.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="5" class="muted">No trades yet</td>';
      body.appendChild(tr);
      return;
    }

    const recent = state.trades.slice(-14).reverse();
    for (const t of recent) {
      const tr = document.createElement("tr");
      const pnlText = (t.pnl >= 0 ? "+" : "") + fmt2(t.pnl);
      tr.innerHTML = `
        <td class="muted">${new Date(t.time).toLocaleTimeString()}</td>
        <td>${t.side}</td>
        <td class="right">${fmt2(t.amount)}</td>
        <td class="right"><span class="tag">${t.scenarioName}</span></td>
        <td class="right ${t.pnl >= 0 ? "ok" : "bad"}">${pnlText}</td>
      `;
      body.appendChild(tr);
    }
  }

  function renderAll() {
    renderStats();
    renderPositions();
    renderTrades();
  }

  function initBalance() {
    const v = parseFloat($("startBalance").value);
    state.balance = Number.isFinite(v) && v >= 0 ? v : 0;
    state.realizedPnl = 0;
    state.housePnl = 0;
    state.houseBalance = 0;
    state.positions = [];
    state.trades = [];
    renderAll();
  }

  // -------- Scenario Modal --------
  function openScenarioModal(side) {
    state.pendingSide = side;
    $("scenarioModal").style.display = "flex";
    $("scenarioHint").textContent = "selecting...";
  }

  function closeScenarioModal() {
    state.pendingSide = null;
    $("scenarioModal").style.display = "none";
    $("scenarioHint").textContent = "ask on open";
  }

  function scenarioFromUI(amount) {
    const sel = $("scenarioSelect").value;

    let pct = 0;
    let name = sel;

    if (sel === "LOSS_FULL") { pct = -100; name = "LOSS -100%"; }
    else if (sel === "WIN_10") { pct = 10; name = "WIN +10%"; }
    else if (sel === "WIN_30") { pct = 30; name = "WIN +30%"; }
    else if (sel === "WIN_50") { pct = 50; name = "WIN +50%"; }
    else if (sel === "CUSTOM") {
      const v = parseFloat($("customPct").value);
      pct = Number.isFinite(v) ? v : 0;
      // Clamp to keep the demo reasonable
      pct = Math.max(-100, Math.min(300, pct));
      name = "CUSTOM " + pct.toFixed(2) + "%";
    } else {
      pct = 0;
      name = "FLAT 0%";
    }

    // PnL uses scenario percent on amount
    const fee = feeFor(amount);
    const pnl = amount * (pct / 100) - fee;

    return { pct, name, pnl };
  }

  // -------- Trading Logic --------
  function openPositionWithScenario(side) {
    if (!Number.isFinite(state.price)) {
      alert("Price not ready yet.");
      return;
    }

    const amount = parseFloat($("tradeAmount").value);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Invalid trade amount.");
      return;
    }
    if (amount > state.balance) {
      alert("Not enough balance.");
      return;
    }

    const mode = $("mode").value;
    const durationSec = parseInt($("duration").value, 10);

    const sc = scenarioFromUI(amount);

    // Reserve amount from balance
    state.balance -= amount;

    const pos = {
      id: uid(),
      side: side,
      amount: amount,
      entryPrice: state.price,
      openedAt: nowTs(),
      mode: mode,
      closeAt: mode === "timed" ? nowTs() + (Number.isFinite(durationSec) ? durationSec * 1000 : 60000) : null,
      scenarioPct: sc.pct,
      scenarioName: sc.name,
    };

    state.positions.push(pos);
    $("scenarioHint").textContent = sc.name;
    renderAll();
  }

  function closePosition(id) {
    const idx = state.positions.findIndex(p => p.id === id);
    if (idx === -1) return;

    const p = state.positions[idx];

    // Scenario PnL (NOT market)
    const fee = feeFor(p.amount);
    const rawPnl = p.amount * (p.scenarioPct / 100) - fee;

    // Split rule: only positive scenario PnL is split 70/30 (House/Player).
    // Losses are kept fully on the player side in this personal demo.
    let playerPnl = rawPnl;
    let houseCut = 0;
    if (rawPnl > 0) {
      playerPnl = rawPnl * 0.30;
      houseCut = rawPnl - playerPnl; // 70%
    }

    // Release reserved amount + player's pnl back to player's balance
    state.balance += p.amount + playerPnl;
    state.realizedPnl += playerPnl;

    // Track house cut separately
    state.houseBalance += houseCut;
    state.housePnl += houseCut;

    state.trades.push({
      time: nowTs(),
      side: p.side,
      amount: p.amount,
      scenarioName: p.scenarioName,
      pnl: playerPnl,
    });

    state.positions.splice(idx, 1);
    renderAll();
  }

  function autoCloseTimedPositions() {
    const t = nowTs();
    const ids = state.positions
      .filter(p => p.mode === "timed" && p.closeAt != null && t >= p.closeAt)
      .map(p => p.id);

    for (const id of ids) closePosition(id);
  }

  // -------- Live Price Feed --------
  async function fetchRestPrice(symbol) {
    try {
      const url = "https://api.binance.com/api/v3/ticker/price?symbol=" + encodeURIComponent(symbol);
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const p = parseFloat(data.price);
      if (Number.isFinite(p) && p > 0) {
        state.price = p;
        state.lastPriceAt = nowTs();
        setFeedStatus("REST");
      }
    } catch (_) {}
  }

  function closeWs() {
    if (state.ws) {
      try { state.ws.close(); } catch (_) {}
      state.ws = null;
      state.wsConnected = false;
    }
  }

  function connectWs(symbol) {
    closeWs();
    const stream = symbol.toLowerCase() + "@trade";
    const url = "wss://stream.binance.com:9443/ws/" + stream;

    setFeedStatus("connecting...");
    const ws = new WebSocket(url);
    state.ws = ws;

    ws.onopen = () => { state.wsConnected = true; setFeedStatus("WS"); };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const p = parseFloat(msg.p);
        if (Number.isFinite(p) && p > 0) {
          state.price = p;
          state.lastPriceAt = nowTs();
        }
      } catch (_) {}
    };
    ws.onclose = () => { state.wsConnected = false; setFeedStatus("disconnected"); };
    ws.onerror = () => { state.wsConnected = false; setFeedStatus("error"); };
  }

  function restartFeed() {
    const symbol = normalizeSymbol($("symbol").value);
    if (!symbol) return;
    fetchRestPrice(symbol);
    connectWs(symbol);
  }

  async function healthCheck() {
    const symbol = normalizeSymbol($("symbol").value);
    if (!symbol) return;

    const age = nowTs() - state.lastPriceAt;
    if (!Number.isFinite(state.price) || age > 9000) {
      await fetchRestPrice(symbol);
    }
    if (!state.wsConnected) {
      connectWs(symbol);
    }
  }

  // -------- Events --------
  $("buyBtn").addEventListener("click", () => openScenarioModal("LONG"));
  $("sellBtn").addEventListener("click", () => openScenarioModal("SHORT"));

  $("cancelScenarioBtn").addEventListener("click", () => closeScenarioModal());
  $("confirmScenarioBtn").addEventListener("click", () => {
    if (!state.pendingSide) return closeScenarioModal();
    const side = state.pendingSide;
    closeScenarioModal();
    openPositionWithScenario(side);
  });

  $("scenarioModal").addEventListener("click", (e) => {
    if (e.target && e.target.id === "scenarioModal") closeScenarioModal();
  });

  $("startBalance").addEventListener("change", initBalance);

  $("mode").addEventListener("change", () => {
    const isTimed = $("mode").value === "timed";
    $("duration").disabled = !isTimed;
  });

  let symTimer = null;
  $("symbol").addEventListener("input", () => {
    clearTimeout(symTimer);
    symTimer = setTimeout(() => restartFeed(), 500);
  });

  // -------- Main Loop --------
  function loop() {
    autoCloseTimedPositions();
    renderAll();
  }

  initBalance();
  restartFeed();
  setInterval(loop, 250);
  setInterval(healthCheck, 3000);
})();
