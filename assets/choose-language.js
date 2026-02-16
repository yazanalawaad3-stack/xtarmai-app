import { initI18n, setLang } from "./i18n.js";

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

  const nextUrl = getNextUrl();
  const backLink = document.getElementById("backLink");
  const continueLink = document.getElementById("continueLink");
  if (backLink) backLink.setAttribute("href", nextUrl);
  if (continueLink) continueLink.setAttribute("href", nextUrl);

  const current = detectLang();
  setActive(current);

  document.getElementById("btnAr")?.addEventListener("click", async ()=>{
    await setLang("ar");
    setActive("ar");
  });

  document.getElementById("btnEn")?.addEventListener("click", async ()=>{
    await setLang("en");
    setActive("en");
  });

  window.addEventListener("lang:changed", (e)=>{
    setActive(e.detail?.lang);
  });
}

main();
