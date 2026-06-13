export type StorageDiagnostics = {
  supported: boolean;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
  secureContext: boolean;
  serviceWorkerSupported: boolean;
  serviceWorkerControlled: boolean;
  offlineCacheReady: boolean;
  offlineFileCount: number;
  installedDisplayMode: boolean;
};

export async function readStorageDiagnostics(): Promise<StorageDiagnostics> {
  const supported = "storage" in navigator;

  if (!supported) {
    return {
      supported: false,
      persisted: null,
      usage: null,
      quota: null,
      secureContext: window.isSecureContext,
      serviceWorkerSupported: "serviceWorker" in navigator,
      serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
      offlineCacheReady: false,
      offlineFileCount: 0,
      installedDisplayMode: isInstalledDisplayMode(),
    };
  }

  const [estimate, persisted, cacheNames] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted?.() ?? Promise.resolve(null),
    "caches" in window ? caches.keys() : Promise.resolve([]),
  ]);
  const offlineCacheName = cacheNames.find((name) => name.startsWith("character-vault-shell-"));
  const offlineFileCount = offlineCacheName ? (await caches.open(offlineCacheName)).keys().then((keys) => keys.length) : 0;

  return {
    supported,
    persisted,
    usage: estimate.usage ?? null,
    quota: estimate.quota ?? null,
    secureContext: window.isSecureContext,
    serviceWorkerSupported: "serviceWorker" in navigator,
    serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller),
    offlineCacheReady: Boolean(offlineCacheName),
    offlineFileCount: await offlineFileCount,
    installedDisplayMode: isInstalledDisplayMode(),
  };
}

function isInstalledDisplayMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export async function requestPersistentStorage() {
  return navigator.storage?.persist?.() ?? false;
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) return "Unavailable";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
