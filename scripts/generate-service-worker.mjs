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
const APP_SHELL = ${JSON.stringify(shellFiles, null, 2)};
const scopeUrl = new URL("./", self.registration.scope);
const indexUrl = new URL("index.html", scopeUrl).href;

function shellUrl(path) {
  return new URL(path, scopeUrl).href;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map(shellUrl))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("character-vault-shell-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(indexUrl).then((cached) => cached ?? fetch(request)),
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
