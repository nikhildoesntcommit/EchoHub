// "Your Tapes" — listener-uploaded audio kept in IndexedDB on this device.
// Uses the same database as the original EchoHub so earlier uploads carry over.

const DB_NAME = 'ai-podcast-hub';
const STORE = 'uploads';
let dbPromise = null;
const urls = new Map();

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
  }));
}

const clockToSeconds = (v) => {
  if (typeof v === 'number') return v;
  const parts = String(v || '').split(':').map(Number);
  return parts.reduce((acc, n) => acc * 60 + (Number.isFinite(n) ? n : 0), 0);
};

function normalize(rec) {
  if (!urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(rec.blob));
  return {
    slug: rec.id,
    title: rec.title || 'Untitled tape',
    band: String(rec.band || rec.category || 'tape').toLowerCase(),
    tags: rec.tags || [],
    description: rec.description || '',
    seconds: rec.seconds ?? clockToSeconds(rec.duration),
    audio: urls.get(rec.id),
    cover: null,
    freq: null,
    isTape: true,
    createdAt: rec.createdAt || Number(String(rec.id).replace(/\D/g, '')) || 0
  };
}

export async function listTapes() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    return (all || []).map(normalize).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveTape({ file, title, band, tags, description, seconds }) {
  const id = `upload-${Date.now()}`;
  const blob = file.slice(0, file.size, file.type);
  await tx('readwrite', (s) => s.put({ id, title, band, category: band, tags, description, seconds, blob, createdAt: Date.now() }));
  return id;
}

export async function deleteTape(id) {
  await tx('readwrite', (s) => s.delete(id));
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
}

export function probeDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    a.src = url;
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(a.duration) ? Math.round(a.duration) : 0); };
    a.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
  });
}
