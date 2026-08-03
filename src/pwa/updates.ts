type UpdateListener = () => void;

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let waitingWorker: ServiceWorker | null = null;
let activationInProgress = false;
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

type ActivatableWorker = Pick<ServiceWorker, "addEventListener" | "postMessage" | "removeEventListener" | "state">;
type WorkerContainer = Pick<ServiceWorkerContainer, "addEventListener" | "removeEventListener">;

/**
 * Attach activation listeners before messaging the waiting worker. Fast desktop
 * browsers can otherwise emit controllerchange before the reload listener exists.
 */
export function activateWaitingWorker(
  worker: ActivatableWorker,
  container: WorkerContainer,
  reload: () => void,
) {
  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    worker.removeEventListener("statechange", onStateChange);
    container.removeEventListener("controllerchange", finish);
    reload();
  };
  const onStateChange = () => {
    if (worker.state === "activated") finish();
  };

  container.addEventListener("controllerchange", finish, { once: true });
  worker.addEventListener("statechange", onStateChange);
  worker.postMessage({ type: "SKIP_WAITING" });
  // Some WebKit/Chromium builds update state synchronously while dispatching the message.
  onStateChange();
}

function waitForInstallingWorker(registration: ServiceWorkerRegistration, timeoutMs = 5000) {
  if (registration.waiting) {
    notifyUpdateAvailable(registration.waiting);
    return Promise.resolve(true);
  }
  const installing = registration.installing;
  if (!installing) return Promise.resolve(false);
  if (installing.state === "installed") {
    notifyUpdateAvailable(installing);
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const finish = (available: boolean) => {
      window.clearTimeout(timer);
      installing.removeEventListener("statechange", onStateChange);
      resolve(available);
    };
    const onStateChange = () => {
      if (installing.state === "installed") {
        notifyUpdateAvailable(registration.waiting ?? installing);
        finish(true);
      } else if (installing.state === "redundant") {
        finish(false);
      }
    };
    const timer = window.setTimeout(() => {
      if (registration.waiting) notifyUpdateAvailable(registration.waiting);
      finish(Boolean(registration.waiting));
    }, timeoutMs);
    installing.addEventListener("statechange", onStateChange);
  });
}

export function registerVaultServiceWorker() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return Promise.resolve(null);
  if (registrationPromise) return registrationPromise;
  registrationPromise = navigator.serviceWorker.register(new URL("sw.js", document.baseURI), {
    scope: import.meta.env.BASE_URL,
    // Do not let an HTTP cache hide a newly deployed service worker.
    updateViaCache: "none",
  })
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
  try {
    await registration.update();
    if (registration.waiting) notifyUpdateAvailable(registration.waiting);
    else await waitForInstallingWorker(registration);
    return hasWaitingUpdate()
      ? { available: true, message: "Update Available" }
      : { available: false, message: "No update available right now." };
  } catch {
    return { available: false, message: "Could not check for updates. Confirm you are online and try again." };
  }
}

export function installWaitingUpdate() {
  if (!waitingWorker) return false;
  if (activationInProgress) return true;
  activationInProgress = true;
  const worker = waitingWorker;
  try {
    activateWaitingWorker(worker, navigator.serviceWorker, () => {
      waitingWorker = null;
      activationInProgress = false;
      window.location.reload();
    });
  } catch {
    activationInProgress = false;
    return false;
  }
  return true;
}
