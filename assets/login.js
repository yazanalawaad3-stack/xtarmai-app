import { supabase, normalizePhone, setBusy, showAlert, hideAlert, assertSupabaseKey, saveSession, loadSession } from "./supabaseClient.js";

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
const btn = document.querySelector("#login");
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

btn.addEventListener("click", async ()=>{
  hideAlert(msgEl);

  const dial = countryEl.value;
  const local = phoneEl.value;
  const phone = normalizePhone(dial, local);
  const password = passEl.value;

  if (!phone || phone.length < 8) return showAlert(msgEl, "اكتب رقم هاتف صحيح.", "err");
  if (!password) return showAlert(msgEl, "اكتب كلمة السر.", "err");

  setBusy(btn, true, "جارٍ تسجيل الدخول...");
  try {
    const { data, error } = await supabase.rpc("login_phone", {
      p_phone: phone,
      p_password: password
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    saveSession({
      token: row.out_token,
      user_id: row.out_user_id,
      public_id: row.out_public_id,
      phone,
      created_at: new Date().toISOString()
    });

    showAlert(msgEl, "تم تسجيل الدخول", "ok");
    setTimeout(()=> location.href="index.html", 400);
  } catch(e) {
    const m = e?.message || String(e);
    console.error("login_phone failed:", e);

    if (m.includes("USER_NOT_FOUND")) showAlert(msgEl, "هذا الرقم غير مسجل.", "err");
    else if (m.includes("WRONG_PASSWORD")) showAlert(msgEl, "كلمة السر غير صحيحة.", "err");
    else if (m.includes("NO_PASSWORD_SET")) showAlert(msgEl, "لا توجد كلمة سر لهذا الحساب.", "err");
    else showAlert(msgEl, "حدث خطأ أثناء تسجيل الدخول. حاول مرة ثانية.", "err");
  } finally {
    setBusy(btn, false);
  }
});

// إذا في جلسة محلية جاهزة
(() => {
  const s = loadSession();
  if (s?.token) location.href="index.html";
})();
