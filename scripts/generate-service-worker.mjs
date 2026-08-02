import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";

const distDirectoryUrl = new URL("../dist/", import.meta.url);
const distDirectory = fileURLToPath(distDirectoryUrl);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat();
}

const files = (await listFiles(distDirectory))
  .filter((path) => !path.endsWith(`${sep}sw.js`))
  .sort();
const shellFiles = files.map((path) => relative(distDirectory, path).split(sep).join("/"));
const digest = createHash("sha256");

for (const path of files) {
  digest.update(await readFile(path));
}

const cacheVersion = digest.digest("hex").slice(0, 12);
const serviceWorker = `const CACHE_NAME = "character-vault-shell-${cacheVersion}";
const STABILITY_HOTFIX_MARKER = "character-vault-hotfix-portrait-load-2026-08-01";
const APP_SHELL = ${JSON.stringify(shellFiles, null, 2)};
const scopeUrl = new URL("./", self.registration.scope);
const indexUrl = new URL("index.html", scopeUrl).href;

function shellUrl(path) {
  return new URL(path, scopeUrl).href;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([caches.has(STABILITY_HOTFIX_MARKER), caches.open(CACHE_NAME)])
      .then(([alreadyApplied, cache]) => cache.addAll(APP_SHELL.map(shellUrl))
        .then(() => alreadyApplied ? undefined : self.skipWaiting())),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const hotfixAlreadyApplied = await caches.has(STABILITY_HOTFIX_MARKER);
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("character-vault-shell-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key)));
      await self.clients.claim();
      if (!hotfixAlreadyApplied) {
        await caches.open(STABILITY_HOTFIX_MARKER);
        const clients = await self.clients.matchAll({ type: "window" });
        await Promise.all(clients.map((client) => client.navigate(client.url)));
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      // Prefer the latest deployed document while online; retain the app shell
      // as a fallback for an offline reload.
      fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(indexUrl, response.clone()));
        return response;
      }).catch(() => caches.match(indexUrl)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })),
  );
});
`;

await writeFile(new URL("sw.js", distDirectoryUrl), serviceWorker);
console.log(`Generated service worker ${cacheVersion} with ${shellFiles.length} offline files.`);
