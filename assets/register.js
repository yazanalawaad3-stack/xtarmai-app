import { supabase, normalizePhone, setBusy, showAlert, hideAlert, assertSupabaseKey } from "./supabaseClient.js";

const COUNTRIES = [
  { name: "لبنان", dial: "961" },
  { name: "سوريا", dial: "963" },
  { name: "السعودية", dial: "966" },
  { name: "الإمارات", dial: "971" },
  { name: "قطر", dial: "974" },
  { name: "الكويت", dial: "965" },
  { name: "العراق", dial: "964" },
  { name: "الأردن", dial: "962" },
  { name: "مصر", dial: "20" },
  { name: "تركيا", dial: "90" },
];

const countryEl = document.querySelector("#country");
const phoneEl = document.querySelector("#phone");
const passEl = document.querySelector("#password");
const pass2El = document.querySelector("#password2");
const inviteEl = document.querySelector("#invite");

const captchaView = document.querySelector("#captchaView");
const captchaEl = document.querySelector("#captcha");
const refreshCaptchaBtn = document.querySelector("#refreshCaptcha");

const btn = document.querySelector("#register");
const msgEl = document.querySelector("#msg");

const keyCheck = assertSupabaseKey();
if (!keyCheck.ok) showAlert(msgEl, keyCheck.msg, "err");

function fillCountries(){
  for (const c of COUNTRIES){
    const opt = document.createElement("option");
    opt.value = c.dial;
    opt.textContent = `${c.name} (+${c.dial})`;
    countryEl.appendChild(opt);
  }
  countryEl.value = "961";
}
fillCountries();

let captchaValue = "";
function genCaptcha(){
  captchaValue = String(Math.floor(1000 + Math.random()*9000));
  captchaView.textContent = captchaValue;
  captchaEl.value = "";
}
genCaptcha();
refreshCaptchaBtn?.addEventListener("click", (e)=>{ e.preventDefault(); genCaptcha(); });

function validatePassword(p){
  if (!p || p.length < 8) return "كلمة السر لازم تكون 8 خانات على الأقل";
  return null;
}

btn.addEventListener("click", async ()=>{
  hideAlert(msgEl);

  const dial = countryEl.value;
  const local = phoneEl.value;
  const phone = normalizePhone(dial, local);

  const invite = String(inviteEl.value||"").trim().toUpperCase();
  const p1 = passEl.value;
  const p2 = pass2El.value;
  const cap = String(captchaEl.value||"").trim();

  if (!phone || phone.length < 8) return showAlert(msgEl, "اكتب رقم هاتف صحيح.", "err");
  const pwErr = validatePassword(p1);
  if (pwErr) return showAlert(msgEl, pwErr, "err");
  if (p1 !== p2) return showAlert(msgEl, "كلمتا السر غير متطابقتين", "err");
  if (!invite) return showAlert(msgEl, "كود الدعوة مطلوب للتسجيل.", "err");
  if (cap !== captchaValue) { showAlert(msgEl, "كود الكابتشا غير صحيح", "err"); genCaptcha(); return; }

  setBusy(btn, true, "جارٍ إنشاء الحساب...");
  try {
    const { data, error } = await supabase.rpc("signup_phone", {
      p_phone: phone,
      p_password: p1,
      p_used_invite_code: invite
    });
    if (error) throw error;

    showAlert(msgEl, "تم التسجيل بنجاح ✅ يمكنك تسجيل الدخول الآن.", "ok");
    setTimeout(()=> location.href="login.html", 700);
  } catch(e) {
    const m = e?.message || String(e);
    console.error("signup_phone failed:", e);

    const ml = m.toLowerCase();

    if (m.includes("INVALID_INVITE_CODE") || ml.includes("invalid invite")) {
      showAlert(msgEl, "كود الدعوة غير صحيح.", "err");
    } else if (m.includes("INVITE_REQUIRED") || ml.includes("used_invite_code is required")) {
      showAlert(msgEl, "كود الدعوة مطلوب للتسجيل.", "err");
    } else if (m.includes("WEAK_PASSWORD")) {
      showAlert(msgEl, "كلمة السر لازم تكون 8 خانات على الأقل.", "err");
    } else if (ml.includes("duplicate") || ml.includes("profiles_phone_key") || ml.includes("phone")) {
      showAlert(msgEl, "هذا الرقم مسجل مسبقًا.", "err");
    } else {
      showAlert(msgEl, "حدث خطأ أثناء إنشاء الحساب. حاول مرة ثانية.", "err");
    }
  } finally {
    setBusy(btn, false);
  }
});
