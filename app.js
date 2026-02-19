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

  async function safeCopy(text){
    try{
      await navigator.clipboard.writeText(String(text));
      return true;
    }catch{
      try{
        const ta = document.createElement('textarea');
        ta.value = String(text);
        ta.setAttribute('readonly','');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      }catch{
        return false;
      }
    }
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

  // Optional demo actions (guarded)
  const addBtn = qs('#addFundsBtn');
  if(addBtn){
    addBtn.addEventListener('click', () => {
      const el = qs('#demoBalance');
      const raw = el.textContent.replace(/,/g,'');
      const v = Number(raw);
      const next = v + 250;
      el.textContent = next.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
      toast('Demo balance updated');
    });
  }

  // Invite friends / referral
  const inviteBtn = qs('#inviteFriendsBtn');
  if(inviteBtn){
    inviteBtn.addEventListener('click', async () => {
      // Replace these with real values from your backend/user session.
      const referralCode = 'LUX-654';
      const referralLink = `${location.origin}${location.pathname}?ref=${encodeURIComponent(referralCode)}`;

      const ok = await safeCopy(referralLink);
      toast(ok ? 'Invite link copied ✅' : `Referral code: ${referralCode}`);
    });
  }

  // User ID chip
  const userIdEl = qs('#userIdValue');
  const copyUserIdBtn = qs('#copyUserIdBtn');
  if(userIdEl){
    const raw = (
      window.LUX_USER_ID ||
      window.USER_ID ||
      localStorage.getItem('lux_user_id') ||
      localStorage.getItem('user_id') ||
      userIdEl.textContent
    );
    const uid = String(raw || '').trim() || '750899';
    userIdEl.textContent = uid;

    if(copyUserIdBtn){
      copyUserIdBtn.addEventListener('click', async () => {
        const ok = await safeCopy(uid);
        toast(ok ? 'ID copied ✅' : 'Copy failed');
      });
    }
  }

  // Top actions
  const settingsBtn = qs('#settingsBtn');
  if(settingsBtn){
    settingsBtn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('lux:settings:open'));
      toast('Settings');
    });
  }

  const supportBtn = qs('#supportBtn');
  if(supportBtn){
    supportBtn.addEventListener('click', () => {
      // If your app provides a support launcher, hook it here.
      if(typeof window.openSupportChat === 'function'){
        window.openSupportChat();
        return;
      }

      window.dispatchEvent(new CustomEvent('lux:support:open'));
      toast('Opening support…');
    });
  }

  // Subtle entrance motion
  window.addEventListener('load', () => {
    document.body.classList.add('lux-loaded');
  });
})();
