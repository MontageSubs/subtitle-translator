const PREFIX = "subtitle-translator:";
const CACHE_NAME = `${PREFIX}shell`;
const SLOT_IDS = ["a", "b"];
const LEGACY_CACHES = ["slot-a", "slot-b", `${PREFIX}slot-a`, `${PREFIX}slot-b`];
const SCOPE = self.registration.scope;
const MANIFEST_URL = new URL("build.json", SCOPE).href;
const BLOB_PREFIX = new URL("__blob__/", SCOPE).href;

const blobKey = (hash) => `${BLOB_PREFIX}${hash}`;
const slotKey = (id) => new URL(`__slot__/${id}`, SCOPE).href;
const directoryUrl = (path) => new URL(path.replace(/(^|\/)index\.html$/, "$1"), SCOPE).href;
const isLegacy = (name) => LEGACY_CACHES.includes(name) || (name.startsWith("workbox-") && name.endsWith(SCOPE));

let slotsPromise = null;
let syncPromise = null;

const openCache = () => caches.open(CACHE_NAME);

async function storedUrls(cache) {
  return new Set((await cache.keys()).map((request) => request.url));
}

function toSlot(id, record) {
  const index = new Map(
    Object.entries(record.files).flatMap(([path, hash]) => [
      [new URL(path, SCOPE).href, hash],
      [directoryUrl(path), hash],
    ])
  );
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
  const response = await fetch(directoryUrl(path), { cache: "reload" });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  if ((await digestOf(response)) !== hash) throw new Error(`${path} digest mismatch`);
  await cache.put(blobKey(hash), response);
}

async function collect(cache) {
  const slots = await listSlots();
  const live = new Set(slots.flatMap((slot) => Object.values(slot.files).map(blobKey)));
  const orphans = (await cache.keys()).filter((request) => request.url.startsWith(BLOB_PREFIX) && !live.has(request.url));
  const invalid = SLOT_IDS.filter((id) => !slots.some((slot) => slot.id === id));
  await Promise.all([...orphans.map((request) => cache.delete(request)), ...invalid.map((id) => cache.delete(slotKey(id)))]);
}

async function update() {
  const manifest = await fetchManifest();
  const [newest] = await listSlots();
  if (newest?.digest === manifest.digest) return;
  const cache = await openCache();
  const stored = await storedUrls(cache);
  const missing = new Map();
  for (const [path, hash] of Object.entries(manifest.files)) if (!stored.has(blobKey(hash))) missing.set(hash, path);
  await Promise.all([...missing].map(([hash, path]) => download(cache, hash, path)));
  if ((await fetchManifest()).digest !== manifest.digest) throw new Error("build changed during update");
  const target = SLOT_IDS.find((id) => id !== newest?.id);
  await cache.put(slotKey(target), new Response(JSON.stringify({ ...manifest, installedAt: Date.now() })));
  slotsPromise = null;
  await collect(cache);
}

function sync() {
  syncPromise ??= update().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

async function serve(request) {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  const slot = (await listSlots()).find((candidate) => candidate.index.has(url.href));
  const cached = slot && (await (await openCache()).match(blobKey(slot.index.get(url.href))));
  return cached ?? fetch(request);
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter(isLegacy).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(serve(request));
});

self.addEventListener("message", (event) => {
  const [port] = event.ports;
  event.waitUntil(
    (async () => {
      if (event.data.type === "check") await sync().catch(() => {});
      const [newest] = await listSlots();
      port.postMessage({ digest: newest?.digest });
    })()
  );
});
