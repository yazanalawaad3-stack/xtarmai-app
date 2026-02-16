import { initI18n } from "./i18n.js";

const LS_LANG_KEY = "site_lang";

function detectLang(){
  const saved = localStorage.getItem(LS_LANG_KEY);
  if (saved === "ar" || saved === "en") return saved;
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("ar") ? "ar" : "en";
}

function getNextUrl(){
  const u = new URL(window.location.href);
  const next = u.searchParams.get("next");
  if (next) return next;
  return "login.html";
}

function setActive(lang){
  const ar = document.getElementById("btnAr");
  const en = document.getElementById("btnEn");
  if (!ar || !en) return;
  ar.classList.toggle("active", lang === "ar");
  en.classList.toggle("active", lang === "en");
}

async function main(){
  await initI18n();

  const current = detectLang();
  setActive(current);

  const nextUrl = getNextUrl();
  const backLink = document.getElementById("backLink");
  if (backLink) backLink.setAttribute("href", nextUrl);

  document.getElementById("btnAr")?.addEventListener("click", ()=>{
    localStorage.setItem(LS_LANG_KEY, "ar");
    window.location.href = nextUrl;
  });

  document.getElementById("btnEn")?.addEventListener("click", ()=>{
    localStorage.setItem(LS_LANG_KEY, "en");
    window.location.href = nextUrl;
  });

  window.addEventListener("lang:changed", (e)=>{
    setActive(e.detail?.lang);
  });
}

main();
