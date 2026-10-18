const PREFIX = "subtitle-translator:";
const CACHE_NAME = `${PREFIX}shell`;
const SLOT_IDS = ["a", "b"];
const SCOPE = self.registration.scope;
const MANIFEST_URL = new URL("build.json", SCOPE).href;
const BLOB_PREFIX = new URL("__blob__/", SCOPE).href;
const ADOPTED_KEY = new URL("__locales__", SCOPE).href;
const MAX_ADOPTED_LOCALES = 8;
const ADOPTION_REFRESH_MS = 60 * 60 * 1000;

const blobKey = (hash) => `${BLOB_PREFIX}${hash}`;
const slotKey = (id) => new URL(`__slot__/${id}`, SCOPE).href;
const directoryUrl = (path) => new URL(path.replace(/(^|\/)index\.html$/, "$1"), SCOPE).href;

let slotsPromise = null;
let syncPromise = null;
let adoptionQueue = Promise.resolve();

const openCache = () => caches.open(CACHE_NAME);

async function storedUrls(cache) {
  return new Set((await cache.keys()).map((request) => request.url));
}

function toSlot(id, record) {
  const index = new Map();
  const add = (path, hash, traits) => {
    const entry = { hash, ...traits };
    index.set(new URL(path, SCOPE).href, entry);
    index.set(directoryUrl(path), entry);
  };
  for (const [path, hash] of Object.entries(record.files)) add(path, hash, {});
  for (const [path, hash] of Object.entries(record.optional ?? {})) add(path, hash, { optional: true });
  for (const [locale, files] of Object.entries(record.locales ?? {})) {
    for (const [path, hash] of Object.entries(files)) add(path, hash, { locale });
  }
  return { id, ...record, index };
}

async function readSlot(cache, id) {
  try {
    const response = await cache.match(slotKey(id));
    return response ? toSlot(id, await response.json()) : null;
  } catch {
    return null;
  }
}

async function readSlots() {
  const cache = await openCache();
  const stored = await storedUrls(cache);
  const records = await Promise.all(SLOT_IDS.map((id) => readSlot(cache, id)));
  return records
    .filter((slot) => slot && Object.values(slot.files).every((hash) => stored.has(blobKey(hash))))
    .sort((a, b) => b.installedAt - a.installedAt);
}

function listSlots() {
  slotsPromise ??= readSlots().catch(() => {
    slotsPromise = null;
    return [];
  });
  return slotsPromise;
}

async function readAdopted(cache) {
  try {
    const response = await cache.match(ADOPTED_KEY);
    return response ? await response.json() : {};
  } catch {
    return {};
  }
}

function recordAdoption(locales) {
  const task = adoptionQueue.then(async () => {
    const cache = await openCache();
    const adopted = await readAdopted(cache);
    const now = Date.now();
    const added = locales.filter((locale) => !(locale in adopted));
    const stale = locales.filter((locale) => locale in adopted && now - adopted[locale] >= ADOPTION_REFRESH_MS);
    if (!added.length && !stale.length) return false;
    for (const locale of [...added, ...stale]) adopted[locale] = now;
    const kept = Object.entries(adopted).sort(([, a], [, b]) => b - a).slice(0, MAX_ADOPTED_LOCALES);
    await cache.put(ADOPTED_KEY, new Response(JSON.stringify(Object.fromEntries(kept))));
    return added.length > 0;
  });
  adoptionQueue = task.catch(() => {});
  return task;
}

async function adopt(locale) {
  if (!(await recordAdoption([locale]))) return;
  await syncPromise?.catch(() => {});
  await sync().catch(() => {});
}

async function openClientLocales(manifest) {
  const clients = await self.clients.matchAll({ type: "window" });
  const urls = clients.map((client) => client.url);
  return Object.keys(manifest.locales ?? {}).filter((locale) => {
    const prefix = new URL(`${locale}/`, SCOPE).href;
    return urls.some((url) => url.startsWith(prefix));
  });
}

async function fetchManifest() {
  const response = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`manifest ${response.status}`);
  return response.json();
}

async function digestOf(response) {
  const bytes = await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer());
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function download(cache, hash, path) {
  for (const mode of ["default", "reload"]) {
    const response = await fetch(directoryUrl(path), { cache: mode });
    if (response.ok && (await digestOf(response)) === hash) return cache.put(blobKey(hash), response);
  }
  throw new Error(`${path} unavailable`);
}

function requiredFiles(manifest, adopted) {
  const required = { ...manifest.files };
  for (const locale of adopted) Object.assign(required, manifest.locales?.[locale]);
  return required;
}

async function fill(cache, manifest, adopted) {
  const stored = await storedUrls(cache);
  const missing = new Map();
  for (const [path, hash] of Object.entries(requiredFiles(manifest, adopted))) if (!stored.has(blobKey(hash))) missing.set(hash, path);
  await Promise.all([...missing].map(([hash, path]) => download(cache, hash, path)));
}

async function commit(cache, manifest, newest) {
  if ((await fetchManifest()).digest !== manifest.digest) throw new Error("build changed during update");
  const target = SLOT_IDS.find((id) => id !== newest?.id);
  const { files, optional, locales, digest, version } = manifest;
  await cache.put(slotKey(target), new Response(JSON.stringify({ files, optional, locales, digest, version, installedAt: Date.now() })));
}

async function sweep(cache) {
  const slots = await readSlots();
  slotsPromise = null;
  if (!slots.length) return;
  const adopted = Object.keys(await readAdopted(cache));
  const live = new Set([ADOPTED_KEY]);
  for (const slot of slots) {
    live.add(slotKey(slot.id));
    for (const hash of Object.values(requiredFiles(slot, adopted))) live.add(blobKey(hash));
    for (const hash of Object.values(slot.optional ?? {})) live.add(blobKey(hash));
  }
  const stale = (await cache.keys()).filter((request) => !live.has(request.url));
  await Promise.all(stale.map((request) => cache.delete(request)));
}

async function update() {
  const manifest = await fetchManifest();
  const cache = await openCache();
  await recordAdoption(await openClientLocales(manifest));
  const adopted = Object.keys(await readAdopted(cache));
  const [newest] = await listSlots();
  try {
    await fill(cache, manifest, adopted);
    if (newest?.digest !== manifest.digest) await commit(cache, manifest, newest);
  } finally {
    await sweep(cache);
  }
}

function sync() {
  syncPromise ??= update().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

async function retain(cache, hash, response) {
  if (response.ok && (await digestOf(response)) === hash) await cache.put(blobKey(hash), response);
}

async function serve(event) {
  const url = new URL(event.request.url);
  url.search = "";
  url.hash = "";
  const cache = await openCache();
  const slots = await listSlots();
  for (const slot of slots) {
    const entry = slot.index.get(url.href);
    const cached = entry && (await cache.match(blobKey(entry.hash)));
    if (!cached) continue;
    if (entry.locale) event.waitUntil(adopt(entry.locale));
    return cached;
  }
  const entry = slots[0]?.index.get(url.href);
  const response = await fetch(event.request);
  if (entry?.locale) event.waitUntil(adopt(entry.locale));
  else if (entry?.optional) event.waitUntil(retain(cache, entry.hash, response.clone()).catch(() => {}));
  return response;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    openCache()
      .then(sweep)
      .catch(() => {})
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(serve(event));
});

self.addEventListener("message", (event) => {
  const [port] = event.ports;
  event.waitUntil(
    (async () => {
      if (event.data.type === "check") await sync().catch(() => {});
      const [newest] = await listSlots();
      port.postMessage({ digest: newest?.digest, version: newest?.version });
    })()
  );
});
