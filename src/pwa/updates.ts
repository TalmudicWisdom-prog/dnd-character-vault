type UpdateListener = () => void;

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let waitingWorker: ServiceWorker | null = null;
const listeners = new Set<UpdateListener>();

function notifyUpdateAvailable(worker: ServiceWorker) {
  waitingWorker = worker;
  listeners.forEach((listener) => listener());
}

export function onUpdateAvailable(listener: UpdateListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function hasWaitingUpdate() {
  return Boolean(waitingWorker);
}

export function registerVaultServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return Promise.resolve(null);
  if (registrationPromise) return registrationPromise;
  registrationPromise = navigator.serviceWorker.register(new URL("sw.js", document.baseURI), { scope: import.meta.env.BASE_URL })
    .then((registration) => {
      if (registration.waiting) notifyUpdateAvailable(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) notifyUpdateAvailable(installing);
        });
      });
      return registration;
    })
    .catch((error: unknown) => {
      console.error("Service worker registration failed", error);
      return null;
    });
  return registrationPromise;
}

export async function checkForAppUpdate() {
  const registration = await registerVaultServiceWorker();
  if (!registration) return { available: false, message: "Update checks are available after installing the production PWA." };
  await registration.update();
  if (registration.waiting) notifyUpdateAvailable(registration.waiting);
  return hasWaitingUpdate()
    ? { available: true, message: "Update Available" }
    : { available: false, message: "No update available right now." };
}

export function installWaitingUpdate() {
  if (!waitingWorker) return false;
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
  return true;
}
