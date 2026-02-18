(() => {
  const qs = (s, el=document) => el.querySelector(s);
  const qsa = (s, el=document) => [...el.querySelectorAll(s)];

  const toastEl = qs('#luxToast');
  const toastText = qs('#toastText');
  let toastTimer = null;

  function toast(msg){
    toastText.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }

  // Bottom dock active state + indicator
  const navItems = qsa('.dock-item');
  const indicator = qs('.dock-indicator');
  function updateIndicator(){
    const activeIndex = Math.max(0, navItems.findIndex(b => b.classList.contains('active')));
    const step = (indicator.parentElement.clientWidth - 20) / 5; // inner width minus padding
    indicator.style.transform = `translateX(${activeIndex * step}px)`;
  }

  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      navItems.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const screen = btn.getAttribute('data-screen');
      const map = {
        trade: 'Trading',
        invest: 'Invest',
        team: 'My Team',
        chat: 'Chat',
        profile: 'Profile'
      };
      updateIndicator();
      toast(`${map[screen] || 'Ready'}`);
    });
  });

  window.addEventListener('resize', updateIndicator);
  updateIndicator();
  // (Main content removed per request)
  const addBtn = qs('#addFundsBtn');
  addBtn.addEventListener('click', () => {
    const el = qs('#demoBalance');
    const raw = el.textContent.replace(/,/g,'');
    const v = Number(raw);
    const next = v + 250;
    el.textContent = next.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    toast('Demo balance updated');
  });

  // Subtle entrance motion
  window.addEventListener('load', () => {
    document.body.classList.add('lux-loaded');
  });
})();
