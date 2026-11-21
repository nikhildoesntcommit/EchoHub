// Save episodes for offline listening using the Cache API.
// The service worker serves these (with byte-range support) when the network is gone.

export const AUDIO_CACHE = 'echohub-audio-v1';
const listeners = new Set();
const inFlight = new Map();
let known = new Set();

const abs = (path) => new URL(path, document.baseURI).href;
const notify = () => listeners.forEach((fn) => fn());

export const offlineSupported = () => 'caches' in window;
export const onOfflineChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const isSaved = (path) => known.has(abs(path));
export const progressOf = (path) => inFlight.get(abs(path)) ?? null;

export async function refreshSaved() {
  if (!offlineSupported()) return;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    known = new Set((await cache.keys()).map((r) => r.url));
    notify();
  } catch { /* private mode */ }
}

export async function saveOffline(path) {
  const url = abs(path);
  if (inFlight.has(url) || known.has(url)) return;
  inFlight.set(url, 0);
  notify();
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    let blob;
    if (res.body && total) {
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        inFlight.set(url, got / total);
        notify();
      }
      blob = new Blob(chunks, { type: res.headers.get('content-type') || 'audio/mpeg' });
    } else {
      blob = await res.blob();
    }
    const cache = await caches.open(AUDIO_CACHE);
    await cache.put(url, new Response(blob, {
      headers: { 'Content-Type': blob.type || 'audio/mpeg', 'Content-Length': String(blob.size) }
    }));
    known.add(url);
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } finally {
    inFlight.delete(url);
    notify();
  }
}

export async function removeOffline(path) {
  const url = abs(path);
  const cache = await caches.open(AUDIO_CACHE);
  await cache.delete(url);
  known.delete(url);
  notify();
}

export async function clearOffline() {
  await caches.delete(AUDIO_CACHE);
  known.clear();
  notify();
}
