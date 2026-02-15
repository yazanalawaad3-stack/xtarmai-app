const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  layout: { background: { color: '#121a24' }, textColor: '#d9d9d9' },
  grid: { vertLines: { color: '#223246' }, horzLines: { color: '#223246' } },
  timeScale: { timeVisible: true, secondsVisible: false },
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderVisible: false,
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
});

async function loadCandles() {
  const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=200');
  const data = await res.json();
  const candles = data.map(c => ({
    time: c[0] / 1000,
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4])
  }));
  candleSeries.setData(candles);
}
loadCandles();

let state = {
  balance: 1000,
  pool: 0,
  step: 0
};

const seq = ['LOSS','LOSS','WIN'];

function updateUI(){
  document.getElementById('balance').textContent = state.balance.toFixed(2);
  document.getElementById('pool').textContent = state.pool.toFixed(2);
  document.getElementById('next').textContent = seq[state.step];
}

document.getElementById('tradeBtn').onclick = () => {
  const stake = Number(document.getElementById('amount').value);
  if(stake <= 0 || stake > state.balance) return;

  const result = seq[state.step];

  if(result === 'LOSS'){
    state.balance -= stake;
    state.pool += stake * 0.7;
  } else {
    const win = state.pool * 0.3;
    state.balance += win;
    state.pool = 0;
  }

  state.step = (state.step + 1) % 3;
  updateUI();
};

document.getElementById('resetBtn').onclick = () => {
  state = { balance:1000, pool:0, step:0 };
  updateUI();
};

updateUI();
