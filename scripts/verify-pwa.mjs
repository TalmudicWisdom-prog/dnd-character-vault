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

console.log(`PWA verified: relative manifest and ${shellFiles.length} cached offline files.`);
