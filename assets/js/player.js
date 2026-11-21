// The EchoHub player engine. One <audio> element, a queue, and the "keep the dial
// playing" behaviour: when the queue runs out, it tunes to the next station up the band.

import { store, dayKey } from './store.js';
import { EPISODES } from './catalog.js';

const audio = document.getElementById('audio');
const bus = new EventTarget();
const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

let resolve = () => null;
let current = null;
let lastTick = null;
let pendingSeconds = 0;
let sleep = null; // { mode: 'time'|'end', until: ms, timer }
let ctx = null;
let analyser = null;
let freqData = null;

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const player = {
  on: (type, fn) => bus.addEventListener(type, (e) => fn(e.detail)),
  get current() { return current; },
  get playing() { return !audio.paused && !audio.ended; },
  get time() { return audio.currentTime || 0; },
  get duration() { return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : current?.seconds || 0; },
  get rate() { return audio.playbackRate; },
  get sleep() { return sleep; },
  get buffering() { return audio.readyState < 3 && !audio.paused; },
  setResolver(fn) { resolve = fn; },

  load(ep, { autoplay = true, startAt = null } = {}) {
    if (!ep) return;
    if (current?.slug === ep.slug) {
      if (autoplay) this.play();
      return;
    }
    commitListening();
    saveProgress();
    current = ep;
    audio.src = ep.audio;
    audio.playbackRate = store.get().settings.rate || 1;
    const saved = store.get().progress[ep.slug];
    const resumeAt = startAt ?? (saved && saved.t > 5 && saved.t < (saved.d || ep.seconds) - 10 ? saved.t : 0);
    if (resumeAt) {
      const seekOnce = () => { audio.currentTime = resumeAt; audio.removeEventListener('loadedmetadata', seekOnce); };
      audio.addEventListener('loadedmetadata', seekOnce);
    }
    store.update((s) => {
      s.history = [ep.slug, ...s.history.filter((x) => x !== ep.slug)].slice(0, 40);
      s.queue = s.queue.filter((x) => x !== ep.slug);
      s.lastStation = ep.slug;
    }, 'history');
    updateMediaSession();
    emit('track', ep);
    if (autoplay) this.play();
  },

  async play() {
    if (!current) return;
    ensureAnalyser();
    if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    try {
      await audio.play();
    } catch (err) {
      if (err?.name !== 'AbortError') emit('error', err);
    }
  },
  pause() { audio.pause(); },
  toggle() { return this.playing ? this.pause() : this.play(); },
  seek(t) {
    if (!current) return;
    audio.currentTime = Math.max(0, Math.min(t, this.duration - 0.25));
    emit('time', this.time);
  },
  skip(delta) { this.seek(this.time + delta); },
  setRate(r) {
    audio.playbackRate = r;
    store.update((s) => { s.settings.rate = r; }, 'settings');
    emit('rate', r);
  },
  cycleRate() {
    const steps = [0.8, 1, 1.25, 1.5, 1.75, 2];
    const i = steps.indexOf(audio.playbackRate);
    this.setRate(steps[(i + 1) % steps.length]);
    return audio.playbackRate;
  },

  // Queue -------------------------------------------------------------
  enqueue(slug, { next = false } = {}) {
    store.update((s) => {
      s.queue = s.queue.filter((x) => x !== slug);
      if (next) s.queue.unshift(slug); else s.queue.push(slug);
    }, 'queue');
    emit('queue');
  },
  dequeue(slug) { store.update((s) => { s.queue = s.queue.filter((x) => x !== slug); }, 'queue'); emit('queue'); },
  moveInQueue(slug, dir) {
    store.update((s) => {
      const i = s.queue.indexOf(slug);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.queue.length) return;
      [s.queue[i], s.queue[j]] = [s.queue[j], s.queue[i]];
    }, 'queue');
    emit('queue');
  },
  clearQueue() { store.update((s) => { s.queue = []; }, 'queue'); emit('queue'); },
  upNext() {
    const q = store.get().queue.map(resolve).filter(Boolean);
    if (q.length) return { ep: q[0], fromQueue: true };
    if (!store.get().settings.autoplay || !current || current.isTape) return null;
    // Next station up the dial (wraps around), skipping ones already finished when possible.
    const dial = [...EPISODES].sort((a, b) => a.freq - b.freq);
    const idx = dial.findIndex((e) => e.slug === current.slug);
    const finished = new Set(store.get().finished);
    for (let k = 1; k <= dial.length; k++) {
      const cand = dial[(Math.max(idx, -1) + k) % dial.length];
      if (cand.slug !== current.slug && !finished.has(cand.slug)) return { ep: cand, fromQueue: false };
    }
    return { ep: dial[(Math.max(idx, -1) + 1) % dial.length], fromQueue: false };
  },
  next() {
    const n = this.upNext();
    if (n) this.load(n.ep, { autoplay: true, startAt: 0 });
  },
  prev() {
    if (this.time > 5) return this.seek(0);
    const h = store.get().history;
    const prevSlug = h[1];
    if (prevSlug) this.load(resolve(prevSlug), { autoplay: true });
    else this.seek(0);
  },

  // Sleep timer -------------------------------------------------------
  setSleep(minutes) {
    if (sleep?.timer) clearTimeout(sleep.timer);
    sleep = null;
    if (minutes === 'end') sleep = { mode: 'end' };
    else if (minutes > 0) {
      sleep = { mode: 'time', until: Date.now() + minutes * 60000 };
      sleep.timer = setTimeout(() => { fadeOutAndPause(); sleep = null; emit('sleep', null); }, minutes * 60000);
    }
    emit('sleep', sleep);
  },

  // Visualiser --------------------------------------------------------
  level() {
    if (!analyser || audio.paused) return 0;
    analyser.getByteFrequencyData(freqData);
    let sum = 0;
    const n = Math.min(48, freqData.length);
    for (let i = 2; i < n; i++) sum += freqData[i];
    return sum / ((n - 2) * 255);
  },
  bands(count = 32) {
    if (!analyser) return null;
    analyser.getByteFrequencyData(freqData);
    const out = new Array(count);
    const usable = Math.floor(freqData.length * 0.7);
    for (let i = 0; i < count; i++) {
      const a = Math.floor(Math.pow(i / count, 1.6) * usable);
      const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / count, 1.6) * usable));
      let m = 0;
      for (let j = a; j < b; j++) m = Math.max(m, freqData[j]);
      out[i] = m / 255;
    }
    return out;
  },
  get hasAnalyser() { return !!analyser; }
};

function ensureAnalyser() {
  // On iOS, routing audio through Web Audio stops playback when the screen locks,
  // which is unacceptable for a podcast app — so iOS gets the procedural visualiser.
  if (ctx || isIOS || !window.AudioContext) return;
  try {
    ctx = new AudioContext();
    const src = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    src.connect(analyser);
    analyser.connect(ctx.destination);
  } catch {
    analyser = null;
  }
}

function fadeOutAndPause() {
  const start = audio.volume;
  let v = start;
  const step = () => {
    v -= 0.05;
    if (v <= 0) { audio.pause(); audio.volume = start; return; }
    audio.volume = v;
    setTimeout(step, 120);
  };
  step();
}

function saveProgress() {
  if (!current || !audio.currentTime) return;
  const t = audio.currentTime;
  const d = player.duration;
  store.update((s) => {
    s.progress[current.slug] = { t, d, at: Date.now() };
    if (d && t / d > 0.97 && !s.finished.includes(current.slug)) s.finished.push(current.slug);
  }, 'progress');
}

function commitListening() {
  if (pendingSeconds < 1 || !current) { pendingSeconds = 0; return; }
  const secs = pendingSeconds;
  const band = current.band;
  pendingSeconds = 0;
  store.update((s) => {
    const k = dayKey();
    s.listenLog[k] = (s.listenLog[k] || 0) + secs;
    s.bandSeconds[band] = (s.bandSeconds[band] || 0) + secs;
  }, 'stats');
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !current) return;
  const art = current.cover ? [{ src: new URL(current.cover, document.baseURI).href, sizes: '640x640', type: 'image/webp' }] : [{ src: new URL('assets/icons/icon-512.png', document.baseURI).href, sizes: '512x512', type: 'image/png' }];
  navigator.mediaSession.metadata = new MediaMetadata({
    title: current.title,
    artist: current.freq ? `EchoHub · ${current.freq.toFixed(1)} FM` : 'EchoHub · Your tapes',
    album: current.band ? current.band[0].toUpperCase() + current.band.slice(1) : 'EchoHub',
    artwork: art
  });
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  try {
    const d = player.duration;
    if (d) navigator.mediaSession.setPositionState({ duration: d, position: Math.min(audio.currentTime, d), playbackRate: audio.playbackRate });
  } catch { /* ignore */ }
}

if ('mediaSession' in navigator) {
  const s = store.get().settings;
  const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch { /* unsupported */ } };
  set('play', () => player.play());
  set('pause', () => player.pause());
  set('seekbackward', (d) => player.skip(-(d.seekOffset || s.skipBack)));
  set('seekforward', (d) => player.skip(d.seekOffset || s.skipFwd));
  set('previoustrack', () => player.prev());
  set('nexttrack', () => player.next());
  set('seekto', (d) => player.seek(d.seekTime));
}

// Audio element wiring ------------------------------------------------
let lastSave = 0;
audio.addEventListener('timeupdate', () => {
  const now = performance.now();
  if (lastTick !== null && !audio.paused) {
    const dt = (now - lastTick) / 1000;
    if (dt > 0 && dt < 2) pendingSeconds += dt;
  }
  lastTick = now;
  if (now - lastSave > 5000) { lastSave = now; saveProgress(); commitListening(); updatePositionState(); }
  emit('time', audio.currentTime);
});
audio.addEventListener('play', () => { lastTick = performance.now(); emit('state', 'playing'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; });
audio.addEventListener('pause', () => { lastTick = null; saveProgress(); commitListening(); emit('state', 'paused'); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; });
audio.addEventListener('waiting', () => emit('state', 'buffering'));
audio.addEventListener('playing', () => emit('state', 'playing'));
audio.addEventListener('loadedmetadata', () => { updatePositionState(); emit('time', audio.currentTime); });
audio.addEventListener('error', () => emit('error', audio.error));
audio.addEventListener('ended', () => {
  saveProgress();
  commitListening();
  store.update((s) => {
    if (current && !s.finished.includes(current.slug)) s.finished.push(current.slug);
    if (current) s.progress[current.slug] = { t: 0, d: player.duration, at: Date.now() };
  }, 'progress');
  emit('state', 'ended');
  if (sleep?.mode === 'end') { sleep = null; emit('sleep', null); return; }
  const n = player.upNext();
  if (n && (n.fromQueue || store.get().settings.autoplay)) {
    emit('autoadvance', n);
    player.load(n.ep, { autoplay: true, startAt: 0 });
  }
});

window.addEventListener('pagehide', () => { saveProgress(); commitListening(); store.flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { saveProgress(); commitListening(); store.flush(); } });
