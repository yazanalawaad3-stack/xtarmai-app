import { supabase, normalizePhone, phoneToEmail, setBusy, showAlert, hideAlert, assertSupabaseKey } from "./supabaseClient.js";
import { COUNTRIES } from "./countries.js";

const countryEl = document.querySelector("#country");
const phoneEl = document.querySelector("#phone");
const passEl = document.querySelector("#password");
const btn = document.querySelector("#login");
const msgEl = document.querySelector("#msg");

const keyCheck = assertSupabaseKey();
if (!keyCheck.ok) {
  showAlert(msgEl, keyCheck.msg, "err");
}

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

  if (!phone || phone.length < 8){
    showAlert(msgEl, "اكتب رقم هاتف صحيح.", "err"); return;
  }
  if (!password){
    showAlert(msgEl, "اكتب كلمة السر.", "err"); return;
  }

  setBusy(btn, true, "جارٍ تسجيل الدخول...");
  try{
    const email = phoneToEmail(phone);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    showAlert(msgEl, "تم تسجيل الدخول ✅", "ok");
    setTimeout(()=> location.href="index.html", 600);
  }catch(e){
    showAlert(msgEl, "خطأ: " + (e?.message || e), "err");
  }finally{
    setBusy(btn, false);
  }
});

// إذا في جلسة جاهزة
(async ()=>{
  const { data } = await supabase.auth.getSession();
  if (data?.session?.user){
    location.href="index.html";
  }
})();
