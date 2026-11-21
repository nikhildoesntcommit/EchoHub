// Tiny persistent store. Everything lives on-device; nothing is sent anywhere.

const KEY = 'echohub:v2';

const DEFAULTS = {
  kept: [],            // slugs the listener saved
  progress: {},        // slug -> { t: seconds, d: duration, at: timestamp }
  finished: [],        // slugs listened to the end
  history: [],         // most-recent-first slugs
  queue: [],           // up-next slugs
  drafts: [],          // studio drafts
  listenLog: {},       // 'YYYY-MM-DD' -> seconds listened
  bandSeconds: {},     // band -> seconds listened
  settings: {
    theme: 'system',   // system | light | dark
    dialSound: true,
    rate: 1,
    autoplay: true,
    skipBack: 15,
    skipFwd: 30,
    studioEngine: 'ai', // ai | template
    aiWriter: false     // the listener has downloaded the on-device model
  },
  lastStation: null,
  onboarded: false
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return migrateLegacy(structuredClone(DEFAULTS));
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...parsed, settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

// Carry favourites over from the original EchoHub so returning listeners keep them.
function migrateLegacy(state) {
  try {
    const legacyFavs = JSON.parse(localStorage.getItem('favorites') || '[]');
    const map = (id) => String(id).replace(/^(technology|science|geography|history)-/, '').replace(/^the-rise/, 'rise');
    state.kept = legacyFavs.map(map).filter(Boolean);
    if (localStorage.getItem('darkMode') === 'true') state.settings.theme = 'dark';
  } catch { /* ignore */ }
  return state;
}

const state = load();
const listeners = new Set();
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  }, 150);
}

export const store = {
  get: () => state,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  update(mutator, topic = 'any') {
    mutator(state);
    persist();
    listeners.forEach((fn) => fn(topic, state));
  },
  flush() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  },
  reset() {
    Object.assign(state, structuredClone(DEFAULTS));
    persist();
    listeners.forEach((fn) => fn('reset', state));
  }
};

// Keep multiple open tabs in sync so one tab never overwrites another's changes.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try {
    const next = JSON.parse(e.newValue);
    Object.assign(state, { ...next, settings: { ...state.settings, ...(next.settings || {}) } });
    listeners.forEach((fn) => fn('sync', state));
  } catch { /* ignore malformed */ }
});

export const isKept = (slug) => state.kept.includes(slug);

export function toggleKept(slug) {
  let kept = false;
  store.update((s) => {
    if (s.kept.includes(slug)) s.kept = s.kept.filter((x) => x !== slug);
    else { s.kept.unshift(slug); kept = true; }
  }, 'kept');
  return kept;
}

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function getStats() {
  const log = state.listenLog;
  const totalSeconds = Object.values(log).reduce((a, b) => a + b, 0);
  // Streak: consecutive days (ending today or yesterday) with >= 60s listened.
  let streak = 0;
  const d = new Date();
  if ((log[dayKey(d)] || 0) < 60) d.setDate(d.getDate() - 1);
  while ((log[dayKey(d)] || 0) >= 60) { streak += 1; d.setDate(d.getDate() - 1); }
  const topBand = Object.entries(state.bandSeconds).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const week = [];
  const w = new Date();
  for (let i = 6; i >= 0; i--) {
    const day = new Date(w); day.setDate(w.getDate() - i);
    week.push({ key: dayKey(day), label: day.toLocaleDateString(undefined, { weekday: 'narrow' }), seconds: log[dayKey(day)] || 0 });
  }
  return { totalSeconds, streak, topBand, finished: state.finished.length, week };
}
