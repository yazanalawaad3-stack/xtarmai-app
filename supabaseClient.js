// ✅ ضع هنا فقط ANON KEY (public). لا تضع service_role أبداً داخل المتصفح.
export const SUPABASE_URL = "https://bgtkvusbblriysozhdvu.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJndGt2dXNiYmxyaXlzb3poZHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwODg2MjgsImV4cCI6MjA4NjY2NDYyOH0.wP51mjoEwMCxlNte6io9jCxvRgKeqWt-k7lEPOvrPOk";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// نعمل trim للمفتاح لأن النسخ من المتصفح أحياناً يضيف مسافات/سطر جديد
const _KEY = String(SUPABASE_ANON_KEY || "").trim();

// ✅ نضيف Headers بشكل صريح (هذا يحل كثير حالات "Invalid API key")
export const supabase = createClient(SUPABASE_URL, _KEY, {
  global: {
    headers: {
      apikey: _KEY,
      Authorization: `Bearer ${_KEY}`,
    }
  }
});

// فحص سريع للمفتاح حتى يعطيك سبب واضح قبل ما نرسل طلبات
export function assertSupabaseKey() {
  if (!_KEY || _KEY.length < 20) {
    return { ok: false, msg: "المفتاح فارغ أو قصير. تأكد أنك وضعت ANON KEY الصحيح في assets/supabaseClient.js" };
  }
  const parts = _KEY.split(".");
  if (parts.length !== 3) {
    return { ok: false, msg: "المفتاح ليس بصيغة JWT (يجب أن يحتوي 3 أجزاء مفصولة بنقاط). انسخه مرة ثانية بدون مسافات." };
  }
  if (!String(SUPABASE_URL).includes("supabase.co")) {
    return { ok: false, msg: "SUPABASE_URL غير صحيح. يجب أن يكون مثل: https://xxxx.supabase.co" };
  }
  return { ok: true, msg: `Supabase OK — keyLen=${_KEY.length}` };
}

// تحويل رقم الهاتف لشكل موحّد: بدون + وبدون مسافات
export function normalizePhone(countryDial, localNumber){
  const dial = String(countryDial||"").replace(/[^\d]/g,"");
  let num = String(localNumber||"").trim().replace(/\s+/g,"").replace(/[^\d]/g,"");
  if (num.startsWith(dial)) return num;
  num = num.replace(/^0+/, "");
  return dial + num;
}

export function setBusy(btn, busy, labelWhenBusy="...") {
  if (!btn) return;
  btn.disabled = !!busy;
  btn.dataset._label = btn.dataset._label || btn.textContent;
  btn.textContent = busy ? labelWhenBusy : btn.dataset._label;
}

export function showAlert(el, msg, type="ok") {
  if (!el) return;
  el.className = "alert " + (type === "err" ? "err" : "ok");
  el.textContent = msg;
  el.hidden = false;
}
export function hideAlert(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
}

// ====== Session (بدون Supabase Auth) ======
const LS_KEY = "app_session_v1";

export function saveSession(session){
  localStorage.setItem(LS_KEY, JSON.stringify(session));
}
export function loadSession(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); }
  catch { return null; }
}
export function clearSession(){
  localStorage.removeItem(LS_KEY);
}
