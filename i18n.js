const LS_LANG_KEY = "site_lang";
let DICT = {};
let CURRENT = "ar";

function get(obj, path){
  return path.split(".").reduce((acc,k)=> (acc && acc[k]!==undefined)?acc[k]:undefined, obj);
}

export function t(key){
  const v = get(DICT, key);
  return (v === undefined || v === null) ? key : String(v);
}

function applyTranslations(){
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{
    const key = el.getAttribute("data-i18n-placeholder");
    el.setAttribute("placeholder", t(key));
  });
  // also update <title data-i18n="...">
  const titleEl = document.querySelector("title[data-i18n]");
  if (titleEl){
    titleEl.textContent = t(titleEl.getAttribute("data-i18n"));
  }
}

function setDocLang(lang){
  CURRENT = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = (lang === "ar") ? "rtl" : "ltr";
}

async function loadDict(lang){
  const res = await fetch(`assets/i18n/${lang}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("I18N_LOAD_FAILED");
  DICT = await res.json();
}

function updateToggle(){
  const btn = document.getElementById("langToggle");
  if (!btn) return;
  btn.textContent = (CURRENT === "ar") ? "EN" : "AR";
}

export async function initI18n(){
  const saved = localStorage.getItem(LS_LANG_KEY);
  const nav = (navigator.language || "en").toLowerCase();
  const detected = saved || (nav.startsWith("ar") ? "ar" : "en");

  setDocLang(detected);
  await loadDict(detected);
  applyTranslations();
  updateToggle();

  const btn = document.getElementById("langToggle");
  if (btn){
    btn.addEventListener("click", async ()=>{
      const next = (CURRENT === "ar") ? "en" : "ar";
      localStorage.setItem(LS_LANG_KEY, next);
      setDocLang(next);
      await loadDict(next);
      applyTranslations();
      updateToggle();
      // Let page scripts react if needed
      window.dispatchEvent(new CustomEvent("lang:changed", { detail: { lang: next } }));
    });
  }
}

window.__i18nReady = initI18n();
