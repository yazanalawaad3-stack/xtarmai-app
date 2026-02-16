import { supabase, normalizePhone, setBusy, showAlert, hideAlert, saveSession } from "./supabaseClient.js";
import { t } from "./i18n.js";

const phoneEl = document.querySelector("#phone");
const passEl = document.querySelector("#password");
const submitBtn = document.querySelector("#login");
const rememberEl = document.querySelector("#remember");
const toggleBtn = document.querySelector("#togglePass");


let iti = null;

function initPhoneInput(){
  if (!window.intlTelInput) return;
  iti = window.intlTelInput(phoneEl, {
    initialCountry: "lb",
    preferredCountries: ["lb","sa","ae","qa","kw","iq","jo","sy","eg","tr","us","gb"],
    separateDialCode: true,
    autoPlaceholder: "off",
    nationalMode: true,
    utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@23.8.1/build/js/utils.js"
  });
}

function userFriendlyError(err){
  const msg = (err?.message || "").toUpperCase();
  if (msg.includes("USER_NOT_FOUND") || msg.includes("WRONG_PASSWORD")) return t("login.err_wrong");
  return t("errors.generic");
}

initPhoneInput();
// init remember
try {
  const saved = localStorage.getItem("remember_phone");
  if (saved) {
    phoneEl.value = saved;
    if (rememberEl) rememberEl.checked = true;
  }
} catch (_) {}

// toggle password visibility
if (toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    const isPw = passEl.type === "password";
    passEl.type = isPw ? "text" : "password";
    toggleBtn.textContent = isPw ? "🙈" : "👁";
  });
}


submitBtn.addEventListener("click", async ()=>{
  hideAlert();

  const dial = iti?.getSelectedCountryData()?.dialCode || "";
  const phone = normalizePhone(dial, phoneEl.value || "");
  const password = passEl.value || "";

  if (!phoneEl.value.trim() || !password) return showAlert(t("errors.generic"));

  setBusy(true, submitBtn);
  try {
    const { data, error } = await supabase.rpc("login_phone", {
      p_phone: phone,
      p_password: password
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.out_token) throw new Error("NO_TOKEN");

    saveSession({
      token: row.out_token,
      user_id: row.out_user_id || null
    });

    showAlert(t("login.ok_login"), "success");
    setTimeout(()=> location.href = "index.html", 300);
  } catch (err) {
    console.error("login error:", err);
    showAlert(userFriendlyError(err));
  } finally {
    setBusy(false, submitBtn);
  }
});
