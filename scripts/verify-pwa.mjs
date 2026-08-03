import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const distDirectory = fileURLToPath(new URL("../dist/", import.meta.url));

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat();
}

const manifest = JSON.parse(await readFile(join(distDirectory, "manifest.webmanifest"), "utf8"));
const serviceWorker = await readFile(join(distDirectory, "sw.js"), "utf8");
const indexDocument = await readFile(join(distDirectory, "index.html"), "utf8");
const shellMatch = serviceWorker.match(/const APP_SHELL = (\[[\s\S]*?\]);/);
if (!shellMatch) throw new Error("Could not read the generated service-worker app shell");

const shellFiles = JSON.parse(shellMatch[1]);
const outputFiles = (await listFiles(distDirectory))
  .filter((path) => !path.endsWith(`${sep}sw.js`))
  .map((path) => relative(distDirectory, path).split(sep).join("/"))
  .sort();

const missing = outputFiles.filter((path) => !shellFiles.includes(path));
const stale = shellFiles.filter((path) => !outputFiles.includes(path));
if (missing.length || stale.length) {
  throw new Error(`Offline shell mismatch. Missing: ${missing.join(", ") || "none"}. Stale: ${stale.join(", ") || "none"}.`);
}

for (const field of ["id", "scope", "start_url"]) {
  if (!String(manifest[field]).startsWith("./")) throw new Error(`Manifest ${field} must be deployment-relative`);
}

if (!manifest.icons?.some((icon) => icon.sizes === "192x192") || !manifest.icons?.some((icon) => icon.sizes === "512x512")) {
  throw new Error("Manifest requires 192x192 and 512x512 icons");
}

const appEntry = indexDocument.match(/src="\.\/(assets\/app-[^"]+\.js)"/)?.[1];
if (!appEntry) throw new Error("Production entry must use a content-addressed application bundle");
const appBundle = await readFile(join(distDirectory, appEntry), "utf8");
for (const marker of ["ffxiv-companion-dawntrail", "Final Fantasy Companion Guide", "arms-of-hadar", "1.1.1-portrait-update-hotfix-"]) {
  if (!appBundle.includes(marker)) throw new Error(`Production application bundle is missing ${marker}`);
}
if (!shellFiles.some((path) => /^assets\/pdf\.worker\.min-[^.]+\.mjs$/.test(path))) {
  throw new Error("Offline shell is missing the Safari-compatible PDF worker");
}
if (!/withResolvers:function\(\)\{/.test(appBundle)) {
  throw new Error("Production application bundle is missing the Promise.withResolvers compatibility implementation");
}
if (!serviceWorker.includes("fetch(request).then") || !serviceWorker.includes(".catch(() => caches.match(indexUrl))")) {
  throw new Error("Service worker must use network-first navigation with an offline shell fallback");
}
for (const marker of ["character-vault-hotfix-portrait-update-2026-08-03", "event.waitUntil(self.skipWaiting())", "client.navigate(client.url)"]) {
  if (!serviceWorker.includes(marker)) throw new Error(`Service worker is missing portrait stability recovery marker: ${marker}`);
}

console.log(`PWA verified: relative manifest, FFXIV, multi-character, Safari-compatible PDF and structured spell import in ${appEntry}, and ${shellFiles.length} cached offline files.`);
