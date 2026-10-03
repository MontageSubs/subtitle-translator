const PREFIX = "subtitle-translator:";
const SLOTS = [`${PREFIX}slot-a`, `${PREFIX}slot-b`];
const LEGACY_SLOTS = ["slot-a", "slot-b"];
const SCOPE = self.registration.scope;
const MANIFEST_URL = new URL("build.json", SCOPE).href;
const META_KEY = new URL("slot-meta", SCOPE).href;

let slotsPromise = null;
let syncPromise = null;

const isObsolete = (name) =>
  !SLOTS.includes(name) &&
  (name.startsWith(PREFIX) || LEGACY_SLOTS.includes(name) || (name.startsWith("workbox-") && name.endsWith(SCOPE)));

const keyFor = (path) => new URL(path.replace(/(^|\/)index\.html$/, "$1"), SCOPE).href;

async function readSlot(name) {
  const cache = await caches.open(name);
  const response = await cache.match(META_KEY);
  return response ? { name, cache, meta: await response.json() } : null;
}

function listSlots() {
  slotsPromise ??= Promise.all(SLOTS.map(readSlot)).then((slots) =>
    slots.filter(Boolean).sort((a, b) => b.meta.installedAt - a.meta.installedAt)
  );
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

async function store(cache, path, hash, previous) {
  const key = keyFor(path);
  let response = previous?.meta.files[path] === hash ? await previous.cache.match(key) : undefined;
  if (!response) {
    response = await fetch(key, { cache: "reload" });
    if (!response.ok) throw new Error(`${path} ${response.status}`);
    if ((await digestOf(response)) !== hash) throw new Error(`${path} digest mismatch`);
  }
  await cache.put(key, response);
}

async function update() {
  const manifest = await fetchManifest();
  const [newest] = await listSlots();
  if (newest?.meta.digest === manifest.digest) return;
  const target = SLOTS.find((name) => name !== newest?.name);
  await caches.delete(target);
  slotsPromise = null;
  const cache = await caches.open(target);
  await Promise.all(Object.entries(manifest.files).map(([path, hash]) => store(cache, path, hash, newest)));
  if ((await fetchManifest()).digest !== manifest.digest) throw new Error("build changed during update");
  await cache.put(META_KEY, new Response(JSON.stringify({ ...manifest, installedAt: Date.now() })));
  slotsPromise = null;
}

function sync() {
  syncPromise ??= update().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

async function serve(event) {
  const { request } = event;
  const slots = await listSlots();
  for (const { cache } of slots) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
  }
  const response = await fetch(request);
  if (response.status === 200 && slots.length) event.waitUntil(slots[0].cache.put(request, response.clone()));
  return response;
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter(isObsolete).map((name) => caches.delete(name))))
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
      port.postMessage({ digest: newest?.meta.digest });
    })()
  );
});
