import { supabase, normalizePhone, setBusy, showAlert, hideAlert } from "./supabaseClient.js";
import { t } from "./i18n.js";

const phoneEl = document.querySelector("#phone");
const passEl = document.querySelector("#password");
const pass2El = document.querySelector("#password2");
const inviteEl = document.querySelector("#invite");
const captchaInEl = document.querySelector("#captcha");
const captchaOutEl = document.querySelector("#captchaView");
const refreshBtn = document.querySelector("#refreshCaptcha");
const submitBtn = document.querySelector("#register");

let iti = null;

function genCaptcha(){
  const code = String(Math.floor(1000 + Math.random()*9000));
  captchaOutEl.textContent = code.split("").join(" ");
  captchaOutEl.dataset.value = code;
}
function getCaptchaValue(){
  return captchaOutEl.dataset.value || "";
}

function validatePassword(p){
  if (!p || p.length < 8) return t("register.err_password_len");
  return null;
}

function userFriendlyError(err){
  const msg = (err?.message || "").toUpperCase();

  if (msg.includes("INVALID_INVITE") || msg.includes("INVALID INVITE")) return t("register.err_invite_required");
  if (msg.includes("USED_INVITE_CODE IS REQUIRED")) return t("register.err_invite_required");
  if (msg.includes("PROFILES_PHONE_KEY") || msg.includes("DUPLICATE") || msg.includes("UNIQUE")) return "رقم الهاتف مستخدم من قبل.";
  return t("errors.generic");
}

function initPhoneInput(){
  if (!window.intlTelInput) return;
  iti = window.intlTelInput(phoneEl, {
    initialCountry: "lb",
    preferredCountries: ["lb","sa","ae","qa","kw","iq","jo","sy","eg","tr","us","gb"],
    separateDialCode: true,
    autoPlaceholder: "polite",
    nationalMode: true,
    utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@23.8.1/build/js/utils.js"
  });
}

window.__i18nReady?.then(()=>{
  if (captchaInEl) captchaInEl.setAttribute("placeholder", t("register.captcha_ph"));
}).catch(()=>{});

window.addEventListener("lang:changed", ()=>{
  if (captchaInEl) captchaInEl.setAttribute("placeholder", t("register.captcha_ph"));
});

initPhoneInput();
genCaptcha();

refreshBtn?.addEventListener("click", ()=>{
  genCaptcha();
  captchaInEl.value = "";
});

submitBtn.addEventListener("click", async ()=>{
  hideAlert();

  const p1 = passEl.value || "";
  const p2 = pass2El.value || "";
  const invite = (inviteEl.value || "").trim().toUpperCase();

  const pwErr = validatePassword(p1);
  if (pwErr) return showAlert(pwErr);

  if (p1 !== p2) return showAlert(t("register.err_password_match"));

  if (!invite) return showAlert(t("register.err_invite_required"));

  const capIn = String(captchaInEl.value || "").trim();
  if (capIn !== getCaptchaValue()) {
    genCaptcha();
    captchaInEl.value = "";
    return showAlert(t("register.err_captcha"));
  }

  const dial = iti?.getSelectedCountryData()?.dialCode || "";
  const phone = normalizePhone(dial, phoneEl.value || "");

  setBusy(true, submitBtn);

  try {
    const { data, error } = await supabase.rpc("signup_phone", {
      p_phone: phone,
      p_password: p1,
      p_used_invite_code: invite
    });

    if (error) throw error;

    showAlert(t("register.ok_created"), "success");
    setTimeout(()=> location.href = "login.html", 600);
  } catch (err) {
    console.error("signup error:", err);
    showAlert(userFriendlyError(err));
  } finally {
    setBusy(false, submitBtn);
  }
});
