// EchoHub — app bootstrap: routing, actions, keyboard, theme, offline.

import { BANDS, EPISODES } from './catalog.js';
import { store, toggleKept } from './store.js';
import { player } from './player.js';
import { silenceStatic } from './tuner.js';
import { refreshSaved, onOfflineChange, saveOffline, removeOffline, isSaved, clearOffline } from './offline.js';
import { listTapes, deleteTape } from './uploads.js';
import { toast, $, $$, fmtFreq } from './ui.js';
import { setTapes, resolveEp, getTapes, offlineBtn } from './components.js';
import * as V from './views.js';
import {
  initNowPlaying, syncTrack, syncPlayState, syncKeepButtons, syncProgressMarks, syncStatus, syncTime,
  syncRate, syncNext, openNowPlaying, closeNowPlaying, isNowPlayingOpen
} from './nowplaying.js';
import {
  openSheet, closeSheet, sheetOpen, openSettings, openQueue, refreshQueueSheet, openSleep, openShortcuts,
  openUpload
} from './sheets.js';

const main = $('#main');
let cleanup = null;
let routeName = '';

player.setResolver(resolveEp);

// ---------------------------------------------------------------- Router
function parse() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, query: new URLSearchParams(qs) };
}

function render() {
  const { parts, query } = parse();
  const [head, arg] = parts;
  let view;
  let name = head || 'listen';
  switch (head) {
    case undefined: view = V.viewListen(); name = 'listen'; break;
    case 'search': view = V.viewSearch(query); break;
    case 'studio': view = V.viewStudio(query); break;
    case 'library': view = V.viewLibrary(query); break;
    case 'about': view = V.viewAbout(); break;
    case 'band': view = V.viewBand(arg); name = 'listen'; break;
    case 'ep': view = V.viewEpisode(arg, query); name = 'listen'; break;
    default: view = V.viewNotFound(); name = '';
  }
  const prevRoute = routeName;
  cleanup?.();
  cleanup = null;
  routeName = name;
  main.innerHTML = view.html;
  main.dataset.view = head || 'listen';
  document.title = view.title === 'Listen' ? 'EchoHub — Tune into ideas' : `${view.title} · EchoHub`;
  $$('[data-nav] a').forEach((a) => {
    const on = a.dataset.route === name;
    a.classList.toggle('is-on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  cleanup = view.mount?.(main) || null;
  syncAll();
  // Keep scroll position when only the query changes on the same tab (e.g. library tabs).
  if (!(prevRoute === name && name === 'library')) window.scrollTo({ top: 0, behavior: 'instant' });
  if (document.activeElement === document.body || !main.contains(document.activeElement)) main.focus({ preventScroll: true });
}

window.addEventListener('hashchange', render);

function syncAll() {
  syncPlayState();
  syncKeepButtons();
  syncProgressMarks();
  syncStatus(resolveEp);
}
document.addEventListener('echo:sync', syncAll);

// ---------------------------------------------------------------- Playback helpers
function playSlug(slug, at) {
  const ep = resolveEp(slug);
  if (!ep) return;
  V.stopStudio();
  if (player.current?.slug === slug) { player.toggle(); return; }
  player.load(ep, { autoplay: true, startAt: at ?? null });
}

async function share(ep) {
  const url = new URL(`#/ep/${ep.slug}`, location.href.split('#')[0]).href;
  const data = { title: `${ep.title} · EchoHub`, text: `Tune into “${ep.title}” on EchoHub${ep.freq ? ` (${fmtFreq(ep.freq)} FM)` : ''}`, url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Couldn’t share — copy the address bar instead');
  }
}

async function refreshTapes() {
  setTapes(await listTapes());
  if (routeName === 'library' || routeName === 'search') render();
}

// ---------------------------------------------------------------- Actions
const ACTIONS = {
  play: (el) => playSlug(el.dataset.slug, el.dataset.at ? Number(el.dataset.at) : undefined),
  toggle: () => { if (player.current) { V.stopStudio(); player.toggle(); } },
  'skip-back': () => player.skip(-store.get().settings.skipBack),
  'skip-fwd': () => player.skip(store.get().settings.skipFwd),
  prev: () => player.prev(),
  next: () => player.next(),
  rate: () => { const r = player.cycleRate(); toast(`Speed ${r}×`); },
  queue: () => openQueue(),
  sleep: () => openSleep(),
  'open-np': () => openNowPlaying(),
  'close-np': () => closeNowPlaying(),
  'np-details': () => { if (player.current && !player.current.isTape) { closeNowPlaying(); location.hash = `#/ep/${player.current.slug}`; } },
  keep: (el) => {
    const slug = el.dataset.keep;
    if (!slug) return;
    const kept = toggleKept(slug);
    toast(kept ? 'Kept in your library' : 'Removed from Kept', kept ? {} : { action: 'Undo', onAction: () => toggleKept(slug) });
  },
  enqueue: (el) => {
    const ep = resolveEp(el.dataset.slug);
    if (!ep) return;
    if (!player.current) { player.load(ep, { autoplay: false }); toast('Ready to play'); return; }
    player.enqueue(ep.slug);
    toast(`Added to up next · ${store.get().queue.length} queued`);
  },
  offline: async (el) => {
    const ep = resolveEp(el.dataset.offline);
    if (!ep) return;
    if (isSaved(ep.audio)) {
      await removeOffline(ep.audio);
      toast('Removed from offline');
      return;
    }
    try {
      await saveOffline(ep.audio);
      toast('Saved for offline listening');
    } catch {
      toast('Download failed — check your connection');
    }
  },
  share: (el) => { const ep = resolveEp(el.dataset.slug); if (ep) share(ep); },
  'play-band': (el) => {
    const eps = EPISODES.filter((e) => e.band === el.dataset.band).sort((a, b) => a.freq - b.freq);
    if (!eps.length) return;
    V.stopStudio();
    player.load(eps[0], { autoplay: true, startAt: 0 });
    store.update((s) => { s.queue = eps.slice(1).map((e) => e.slug); }, 'queue');
    syncNext();
    toast(`Playing ${BANDS.find((b) => b.id === el.dataset.band).name} · ${eps.length} stations`);
  },
  'tune-shuffle': () => {
    if (routeName === 'listen' && $('#tunerHost')) document.dispatchEvent(new CustomEvent('echo:shuffle'));
    else { location.hash = '#/'; setTimeout(() => document.dispatchEvent(new CustomEvent('echo:shuffle')), 120); }
  },
  // Go back within the app when we navigated here; otherwise follow the link to the dial.
  back: (el, e) => { if (window.__echoNavCount > 0) { e.preventDefault(); history.back(); } },
  settings: () => openSettings(),
  shortcuts: () => openShortcuts(),
  upload: () => openUpload(refreshTapes),
  'close-sheet': () => closeSheet(),
  'delete-tape': async (el) => {
    const ep = resolveEp(el.dataset.slug);
    if (!ep || !confirm(`Delete “${ep.title}” from this device?`)) return;
    if (player.current?.slug === ep.slug) player.pause();
    await deleteTape(ep.slug);
    player.dequeue(ep.slug);
    toast('Tape deleted');
    refreshTapes();
  },
  'clear-history': () => {
    const prev = store.get().history;
    store.update((s) => { s.history = []; }, 'history');
    render();
    toast('History cleared', { action: 'Undo', onAction: () => { store.update((s) => { s.history = prev; }, 'history'); render(); } });
  },
  'clear-offline': async () => {
    if (!confirm('Remove all offline downloads from this device?')) return;
    await clearOffline();
    toast('Downloads removed');
  }
};

window.__echoNavCount = 0;
window.addEventListener('hashchange', () => { window.__echoNavCount += 1; });

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  if (el.tagName !== 'A' || el.dataset.action !== 'back') e.preventDefault();
  fn(el, e);
});

// ---------------------------------------------------------------- Keyboard
let gPending = 0;
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  const typing = t.closest?.('input, textarea, select, [contenteditable="true"]');
  if (e.key === 'Escape') {
    if (isNowPlayingOpen() && !sheetOpen()) { closeNowPlaying(); e.preventDefault(); }
    return;
  }
  if (typing) return;
  const onSlider = t.getAttribute?.('role') === 'slider';
  const k = e.key;
  if (gPending && Date.now() - gPending < 1200) {
    const dest = { l: '#/', s: '#/search', t: '#/studio', b: '#/library', a: '#/about' }[k.toLowerCase()];
    gPending = 0;
    if (dest) { closeNowPlaying(); location.hash = dest; e.preventDefault(); return; }
  }
  if (k === 'g') { gPending = Date.now(); return; }
  if ((k === ' ' && !t.closest('button, a')) || k === 'k') { e.preventDefault(); ACTIONS.toggle(); }
  else if (k === 'j' || (k === 'ArrowLeft' && !onSlider)) { if (player.current) { e.preventDefault(); ACTIONS['skip-back'](); } }
  else if (k === 'l' || (k === 'ArrowRight' && !onSlider)) { if (player.current) { e.preventDefault(); ACTIONS['skip-fwd'](); } }
  else if (k === 'N') player.next();
  else if (k === 'P') player.prev();
  else if (k === 'f' && player.current && !player.current.isTape) ACTIONS.keep({ dataset: { keep: player.current.slug } });
  else if (k === 's' && player.current) ACTIONS.rate();
  else if (k === 'm' && player.current) (isNowPlayingOpen() ? closeNowPlaying() : openNowPlaying());
  else if (k === 't') ACTIONS['tune-shuffle']();
  else if (k === '/') { e.preventDefault(); closeNowPlaying(); if (routeName === 'search') $('#q')?.focus(); else location.hash = '#/search'; }
  else if (k === '?') openShortcuts();
});

// ---------------------------------------------------------------- Theme
const mqDark = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const pref = store.get().settings.theme;
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.dataset.theme = pref; else delete root.dataset.theme;
  const dark = pref === 'dark' || (pref === 'system' && mqDark.matches);
  $$('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0d0c10' : '#f2ede4'));
}
mqDark.addEventListener?.('change', applyTheme);

// ---------------------------------------------------------------- Store / player wiring
store.subscribe((topic) => {
  if (topic === 'settings') { applyTheme(); syncRate(); if (!store.get().settings.dialSound) silenceStatic(); }
  if (topic === 'kept') { syncKeepButtons(); if (routeName === 'library' && /tab=kept|^#\/library$/.test(location.hash)) render(); }
  if (topic === 'queue') { syncNext(); refreshQueueSheet(); }
  if (topic === 'progress') { syncProgressMarks(); syncStatus(resolveEp); }
  if (topic === 'reset') { applyTheme(); render(); }
  if (topic === 'sync') { applyTheme(); syncRate(); syncAll(); syncNext(); }
});

player.on('track', () => { syncTrack(); syncPlayState(); });
player.on('state', (st) => {
  syncPlayState();
  $('#deck').classList.toggle('is-buffering', st === 'buffering');
  if (st === 'playing') V.stopStudio();
});
let lastMarks = 0;
player.on('time', () => {
  syncTime();
  const now = performance.now();
  if (now - lastMarks > 1000) { lastMarks = now; syncProgressMarks(); }
});
player.on('rate', syncRate);
player.on('queue', syncNext);
player.on('autoadvance', ({ ep, fromQueue }) => toast(fromQueue ? `Up next: ${ep.title}` : `Tuning to ${fmtFreq(ep.freq)} · ${ep.title}`));
player.on('error', () => {
  if (!player.current) return;
  toast(navigator.onLine ? 'Couldn’t play this episode. Try again in a moment.' : 'You’re offline and this station isn’t saved.');
});

onOfflineChange(() => {
  $$('[data-offline]').forEach((b) => {
    const ep = resolveEp(b.dataset.offline);
    if (!ep) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = offlineBtn(ep, [...b.classList].filter((c) => !['ibtn', 'dl'].includes(c)).join(' '));
    const fresh = tmp.firstElementChild;
    b.dataset.state = fresh.dataset.state;
    b.style.setProperty('--dl', fresh.style.getPropertyValue('--dl'));
    b.setAttribute('aria-label', fresh.getAttribute('aria-label'));
    b.title = fresh.title;
  });
  if (routeName === 'library' && /tab=offline/.test(location.hash)) render();
});

// ---------------------------------------------------------------- Network status
function netStatus() {
  const on = navigator.onLine;
  document.body.classList.toggle('is-offline', !on);
  const el = $('#netStatus');
  if (el) el.querySelector('span').textContent = on ? 'On air' : 'Offline · saved stations only';
}
window.addEventListener('online', () => { netStatus(); toast('Back on air'); });
window.addEventListener('offline', () => { netStatus(); toast('You’re offline — saved stations still play'); });

// ---------------------------------------------------------------- Service worker
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const promptUpdate = (w) => toast('A new version of EchoHub is ready', { action: 'Refresh', onAction: () => w.postMessage('skipWaiting') });
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(w); });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; location.reload(); });
    } catch { /* SW optional */ }
  });
}

// ---------------------------------------------------------------- Boot
async function boot() {
  applyTheme();
  netStatus();
  initNowPlaying();
  syncRate();
  setTapes(await listTapes());
  await refreshSaved();
  // Restore the last station into the deck (paused) so the player is never empty on return.
  const s = store.get();
  const last = s.history[0] && resolveEp(s.history[0]);
  if (last) player.load(last, { autoplay: false });
  render();
  document.documentElement.classList.add('is-ready');
}

boot();

// Expose for debugging in the console.
window.EchoHub = { player, store, getTapes };
