const lastRouteKey = "vault:last-route";
const scrollPrefix = "vault:scroll:";

function currentRouteKey() {
  return window.location.hash || "#characters";
}

export function savedRouteHash() {
  const saved = localStorage.getItem(lastRouteKey);
  return saved?.startsWith("#") ? saved : "";
}

export function rememberRoute() {
  localStorage.setItem(lastRouteKey, currentRouteKey());
}

export function rememberScroll() {
  sessionStorage.setItem(`${scrollPrefix}${currentRouteKey()}`, String(window.scrollY));
}

export function restoreScroll() {
  const saved = Number(sessionStorage.getItem(`${scrollPrefix}${currentRouteKey()}`) ?? 0);
  window.setTimeout(() => window.scrollTo({ top: saved, left: 0, behavior: "auto" }), 50);
}

export function flushBeforeBackgrounding() {
  window.dispatchEvent(new CustomEvent("vault:flush"));
  rememberRoute();
  rememberScroll();
}
