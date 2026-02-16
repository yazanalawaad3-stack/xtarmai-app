import { supabase, normalizePhone, phoneToEmail, setBusy, showAlert, hideAlert } from "./supabaseClient.js";
import { COUNTRIES } from "./countries.js";

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
refreshCaptchaBtn.addEventListener("click", (e)=>{ e.preventDefault(); genCaptcha(); });

function validatePassword(p){
  if (!p || p.length < 8) return "كلمة السر لازم تكون 8 أحرف على الأقل";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "كلمة السر لازم تحتوي حروف + أرقام";
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

  if (!phone || phone.length < 8){
    showAlert(msgEl, "اكتب رقم هاتف صحيح.", "err"); return;
  }
  const pwErr = validatePassword(p1);
  if (pwErr){ showAlert(msgEl, pwErr, "err"); return; }
  if (p1 !== p2){ showAlert(msgEl, "كلمتا السر غير متطابقتين", "err"); return; }
  if (!invite){ showAlert(msgEl, "كود الدعوة مطلوب للتسجيل", "err"); return; }
  if (cap !== captchaValue){ showAlert(msgEl, "كود الكابتشا غير صحيح", "err"); genCaptcha(); return; }

  setBusy(btn, true, "جارٍ إنشاء الحساب...");
  try{
    // 1) انشاء مستخدم Auth
    const email = phoneToEmail(phone);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: p1
    });
    if (error) throw error;

    const userId = data?.user?.id;
    if (!userId){
      throw new Error("تم إنشاء الحساب لكن لا يوجد user id (قد يكون تأكيد ايميل مفعّل).");
    }

    // 2) إنشاء صف profiles (نفترض triggers تملأ public_id + invite_code + level + invited_by)
    const { error: pErr } = await supabase
      .from("profiles")
      .insert({
        user_id: userId,
        phone,
        used_invite_code: invite
      });

    if (pErr){
      showAlert(
        msgEl,
        "تم إنشاء المستخدم ✅ لكن فشل إدخال profiles.\n" +
        "غالباً السبب: RLS Policies أو التريغر لا يملأ الحقول NOT NULL (public_id / invite_code).\n" +
        "الخطأ: " + (pErr.message || pErr),
        "err"
      );
      return;
    }

    showAlert(msgEl, "تم التسجيل بنجاح ✅ يمكنك تسجيل الدخول الآن.", "ok");
    setTimeout(()=> location.href="login.html", 800);
  }catch(e){
    showAlert(msgEl, "خطأ: " + (e?.message || e), "err");
  }finally{
    setBusy(btn, false);
  }
});
