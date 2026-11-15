const CONFIG = __SERVICE_WORKER_CONFIG__;
const CACHE_NAME = CONFIG.cacheName;
const SLOT_IDS = ["a", "b"];
const SCOPE = self.registration.scope;
const MANIFEST_URL = new URL("build.json", SCOPE).href;
const BLOB_PREFIX = new URL("__blob__/", SCOPE).href;
const RETAINED_KEY = new URL("__retained__", SCOPE).href;
const LOCALE_GROUP_PREFIX = "locale:";
const MAX_RETAINED_LOCALES = 3;
const RETAINED_LOCALE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USE_REFRESH_MS = 60 * 60 * 1000;
const MAX_DOWNLOAD_LANES = 6;
const SLOW_CONNECTION_TYPES = ["slow-2g", "2g"];
const CACHE_AVAILABLE = typeof caches !== "undefined";
const isNestedChannelPath = (pathname) => CONFIG.nestedBasePaths.some((path) => pathname.startsWith(path));

const blobKey = (hash) => `${BLOB_PREFIX}${hash}`;
const slotKey = (id) => new URL(`__slot__/${id}`, SCOPE).href;
const directoryUrl = (path) => new URL(path.replace(/(^|\/)index\.html$/, "$1"), SCOPE).href;
const isLocaleGroup = (group) => group.startsWith(LOCALE_GROUP_PREFIX);
const localeOfGroup = (group) => group.slice(LOCALE_GROUP_PREFIX.length);

let slotsPromise = null;
let prefetchGroups = new Set();
let syncPromise = null;
let retentionQueue = Promise.resolve();

const openCache = () => caches.open(CACHE_NAME);

async function storedUrls(cache) {
  return new Set((await cache.keys()).map((request) => request.url));
}

function toSlot(id, record) {
  const index = new Map();
  const add = (path, hash, group) => {
    const entry = { hash, group };
    index.set(new URL(path, SCOPE).href, entry);
    index.set(directoryUrl(path), entry);
  };
  for (const [path, hash] of Object.entries(record.files)) add(path, hash);
  for (const [group, files] of Object.entries(record.groups ?? {})) {
    for (const [path, hash] of Object.entries(files)) add(path, hash, group);
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

async function readRetained(cache) {
  try {
    const response = await cache.match(RETAINED_KEY);
    return response ? await response.json() : {};
  } catch {
    return {};
  }
}

function trimLocales(retained) {
  const now = Date.now();
  const kept = new Set(
    Object.keys(retained)
      .filter((group) => isLocaleGroup(group) && now - retained[group] < RETAINED_LOCALE_TTL_MS)
      .sort((a, b) => retained[b] - retained[a])
      .slice(0, MAX_RETAINED_LOCALES)
  );
  for (const group of Object.keys(retained)) if (isLocaleGroup(group) && !kept.has(group)) delete retained[group];
  return retained;
}

function recordUse(groups) {
  const task = retentionQueue.then(async () => {
    const cache = await openCache();
    const retained = await readRetained(cache);
    const now = Date.now();
    const newestUse = Math.max(0, ...Object.values(retained));
    const added = groups.filter((group) => !(group in retained));
    const stale = groups.filter((group) => group in retained && (retained[group] < newestUse || now - retained[group] >= USE_REFRESH_MS));
    if (!added.length && !stale.length) return false;
    for (const group of [...added, ...stale]) retained[group] = now;
    await cache.put(RETAINED_KEY, new Response(JSON.stringify(trimLocales(retained))));
    return added.length > 0;
  });
  retentionQueue = task.catch(() => {});
  return task;
}

async function markUsed(group) {
  if (!(await recordUse([group]))) return;
  await syncPromise?.catch(() => {});
  await sync().catch(() => {});
}

async function openClientLocaleGroups(manifest) {
  const clients = await self.clients.matchAll({ type: "window" });
  const urls = clients.map((client) => client.url);
  return Object.keys(manifest.groups ?? {}).filter((group) => {
    if (!isLocaleGroup(group)) return false;
    const prefix = new URL(`${localeOfGroup(group)}/`, SCOPE).href;
    return urls.some((url) => url.startsWith(prefix));
  });
}

async function fetchManifest() {
  const response = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`manifest ${response.status}`);
  const manifest = await response.json();
  if (manifest.channel !== CONFIG.channel) throw new Error(`manifest channel ${manifest.channel}`);
  return manifest;
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

function requiredFiles(record, groups) {
  const required = { ...record.files };
  for (const group of groups) Object.assign(required, record.groups?.[group]);
  return required;
}

function eagerGroups(retained, openLocales) {
  const eager = new Set(prefetchGroups);
  for (const group of Object.keys(retained)) if (!isLocaleGroup(group) || openLocales.includes(group)) eager.add(group);
  return [...eager];
}

const isDocumentationPath = (path) => /(^|\/)docs(\/|$)/.test(path);

let requestedPrefixes = [];

const priorityOf = (path) => (requestedPrefixes.some((prefix) => path.startsWith(prefix)) ? 0 : isDocumentationPath(path) ? 2 : 1);

function downloadLanes() {
  const connection = navigator.connection;
  if (!connection) return MAX_DOWNLOAD_LANES;
  if (connection.saveData || SLOW_CONNECTION_TYPES.includes(connection.effectiveType)) return 1;
  if (connection.effectiveType === "3g") return 2;
  if (connection.effectiveType === "4g" && connection.downlink > 0) return Math.min(MAX_DOWNLOAD_LANES, Math.max(3, Math.round(connection.downlink / 2)));
  return 4;
}

function takeNext(queue) {
  let best = 0;
  for (let index = 1; index < queue.length; index++) if (priorityOf(queue[index][1]) < priorityOf(queue[best][1])) best = index;
  return queue.splice(best, 1)[0];
}

async function downloadPrioritized(cache, entries) {
  const queue = [...entries];
  const lanes = Array.from({ length: Math.min(downloadLanes(), queue.length) }, async () => {
    for (let entry = takeNext(queue); entry; entry = takeNext(queue)) await download(cache, entry[0], entry[1]);
  });
  await Promise.all(lanes);
}

async function fill(cache, manifest, groups) {
  const stored = await storedUrls(cache);
  const missing = new Map();
  for (const [path, hash] of Object.entries(requiredFiles(manifest, groups))) if (!stored.has(blobKey(hash))) missing.set(hash, path);
  await downloadPrioritized(cache, [...missing]);
}

async function commit(cache, manifest, newest) {
  if ((await fetchManifest()).revision !== manifest.revision) throw new Error("build changed during update");
  const target = SLOT_IDS.find((id) => id !== newest?.id);
  const { files, groups, digest, groupDigests, revision, version } = manifest;
  await cache.put(slotKey(target), new Response(JSON.stringify({ files, groups, digest, groupDigests, revision, version, installedAt: Date.now() })));
}

async function sweep(cache) {
  const slots = await readSlots();
  slotsPromise = null;
  if (!slots.length) return;
  const retained = Object.keys(await readRetained(cache));
  const live = new Set([RETAINED_KEY]);
  for (const slot of slots) {
    live.add(slotKey(slot.id));
    for (const hash of Object.values(requiredFiles(slot, retained))) live.add(blobKey(hash));
  }
  const stale = (await cache.keys()).filter((request) => !live.has(request.url));
  await Promise.all(stale.map((request) => cache.delete(request)));
}

async function update() {
  const manifest = await fetchManifest();
  const cache = await openCache();
  await recordUse(await openClientLocaleGroups(manifest));
  const retained = await readRetained(cache);
  const [newest] = await listSlots();
  try {
    await fill(cache, manifest, eagerGroups(retained, await openClientLocaleGroups(manifest)));
    prefetchGroups = new Set();
    if (newest?.revision !== manifest.revision) await commit(cache, manifest, newest);
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

async function lookup(url) {
  const cache = await openCache();
  const slots = await listSlots();
  for (const slot of slots) {
    const entry = slot.index.get(url);
    const response = entry && (await cache.match(blobKey(entry.hash)));
    if (response) return { response, group: entry.group };
  }
  const entry = slots[0]?.index.get(url);
  return { group: entry?.group, missingHash: entry?.hash };
}

async function cacheFetched(hash, response) {
  if (!response.ok || (await digestOf(response)) !== hash) return;
  await (await openCache()).put(blobKey(hash), response.clone());
}

async function serve(event) {
  const url = new URL(event.request.url);
  url.search = "";
  url.hash = "";
  const { response, group, missingHash } = await lookup(url.href).catch(() => ({}));
  if (group) event.waitUntil(markUsed(group).catch(() => {}));
  if (response) return response;
  const live = await fetch(event.request);
  if (missingHash && live.ok) event.waitUntil(cacheFetched(missingHash, live.clone()).catch(() => {}));
  return live;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  if (!CACHE_AVAILABLE) {
    event.waitUntil(self.registration.unregister());
    return;
  }
  event.waitUntil(
    openCache()
      .then(sweep)
      .catch(() => {})
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const { origin, pathname } = new URL(request.url);
  if (!CACHE_AVAILABLE || request.method !== "GET" || origin !== self.location.origin || isNestedChannelPath(pathname)) return;
  event.respondWith(serve(event));
});

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

async function digestFor(slot, groups) {
  const covered = groups.filter((group) => slot.groupDigests?.[group]).sort();
  return sha256Hex([slot.digest, ...covered.map((group) => `${group}=${slot.groupDigests[group]}`)].join("|"));
}

async function prefetch(requested) {
  const cache = await openCache();
  const [newest] = await listSlots();
  if (!newest) return;
  const retained = await readRetained(cache);
  const free = MAX_RETAINED_LOCALES - Object.keys(retained).filter(isLocaleGroup).length;
  const wanted = requested.filter((group) => isLocaleGroup(group) && newest.groups?.[group] && !(group in retained)).slice(0, Math.max(0, free));
  if (!wanted.length) return;
  const oldest = Math.min(Date.now(), ...Object.values(retained)) - 1;
  for (const group of wanted) retained[group] = oldest;
  await cache.put(RETAINED_KEY, new Response(JSON.stringify(retained)));
  prefetchGroups = new Set(wanted);
  await sync().catch(() => {});
}

self.addEventListener("message", (event) => {
  if (event.data.type === "prioritize") {
    requestedPrefixes = Array.isArray(event.data.prefixes) ? event.data.prefixes.filter((prefix) => typeof prefix === "string") : [];
    return;
  }
  if (event.data.type === "prefetch") {
    const groups = Array.isArray(event.data.groups) ? event.data.groups.filter((group) => typeof group === "string") : [];
    event.waitUntil(retentionQueue.then(() => prefetch(groups)).catch(() => {}));
    return;
  }
  const [port] = event.ports;
  event.waitUntil(
    (async () => {
      if (event.data.type === "check") await sync().catch(() => {});
      const [newest] = await listSlots();
      if (!newest) return port.postMessage({});
      const retained = Object.keys(await readRetained(await openCache()));
      const groups = Array.isArray(event.data.groups) ? event.data.groups : retained;
      port.postMessage({ digest: await digestFor(newest, groups), version: newest.version, groups: groups.filter((group) => newest.groupDigests?.[group]) });
    })()
  );
});
