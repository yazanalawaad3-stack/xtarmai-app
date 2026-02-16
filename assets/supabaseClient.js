// ✅ ضع هنا فقط ANON KEY (public). لا تضع service_role أبداً داخل المتصفح.
export const SUPABASE_URL = "https://bgtkvusbblriysozhdvu.supabase.co";
export const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_KEY_HERE";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// تحويل رقم الهاتف لشكل موحّد: بدون + وبدون مسافات
export function normalizePhone(countryDial, localNumber){
  const dial = String(countryDial||"").replace(/[^\d]/g,"");
  let num = String(localNumber||"").trim().replace(/\s+/g,"").replace(/[^\d]/g,"");
  // إذا المستخدم كتب الرقم كامل يبدأ بـ dial، لا نكرره
  if (num.startsWith(dial)) return num;
  // لو كتب 0 بالبداية (مثل 03xxxxxx) نحذف الصفر
  num = num.replace(/^0+/, "");
  return dial + num;
}

// حيلة حتى نستخدم Auth email+password لكن ندخل/نخرج برقم هاتف:
// ننشئ ايميل داخلي مبني على الهاتف
export function phoneToEmail(phoneDigits){
  return `${phoneDigits}@phone.local`;
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
