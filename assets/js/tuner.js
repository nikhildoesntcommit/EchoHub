// The Tuner — EchoHub's signature control. A draggable FM dial where every
// episode is a station. Between stations you hear (soft, synthesised) static.

import { BANDS } from './catalog.js';
import { esc, prefersReducedMotion } from './ui.js';
import { store } from './store.js';

const MIN = 87.5;
const MAX = 108;
const PX = 84; // pixels per MHz

let noiseCtx = null;
let noiseGain = null;
let noiseFilter = null;

function ensureNoise() {
  if (noiseCtx || !window.AudioContext) return;
  try {
    noiseCtx = new AudioContext();
    const len = noiseCtx.sampleRate * 2;
    const buf = noiseCtx.createBuffer(1, len, noiseCtx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Slightly brown-ish noise: warmer than pure white, less fatiguing.
      const white = Math.random() * 2 - 1;
      last = (last + 0.06 * white) / 1.06;
      data[i] = last * 3.2 + white * 0.25;
    }
    const src = noiseCtx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    noiseFilter = noiseCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 0.6;
    noiseGain = noiseCtx.createGain();
    noiseGain.gain.value = 0;
    src.connect(noiseFilter).connect(noiseGain).connect(noiseCtx.destination);
    src.start();
  } catch {
    noiseCtx = null;
  }
}

function setStatic(level) {
  if (!noiseCtx || !noiseGain) return;
  const on = store.get().settings.dialSound;
  const target = on ? Math.max(0, Math.min(1, level)) * 0.05 : 0;
  noiseGain.gain.setTargetAtTime(target, noiseCtx.currentTime, 0.04);
  if (noiseFilter) noiseFilter.frequency.setTargetAtTime(1200 + Math.random() * 1600, noiseCtx.currentTime, 0.08);
}

export function silenceStatic() { setStatic(0); }

export function createTuner(host, stations, { value, onTune, onLock }) {
  const sorted = [...stations].sort((a, b) => a.freq - b.freq);
  const width = (MAX - MIN) * PX;
  let freq = value ?? sorted[0].freq;
  let dragging = false;
  let anim = null;

  // Build the tape: ticks + band strips + station markers.
  const ticks = [];
  for (let f = Math.ceil(MIN * 5) / 5; f <= MAX + 0.001; f += 0.2) {
    const x = (f - MIN) * PX;
    const major = Math.abs(f - Math.round(f)) < 0.01;
    const half = !major && Math.abs(f * 2 - Math.round(f * 2)) < 0.01;
    ticks.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${major ? 0 : half ? 10 : 18}" y2="40" class="${major ? 'tk tk--major' : 'tk'}"/>`);
    if (major && Math.round(f) % 2 === 0) ticks.push(`<text x="${x.toFixed(1)}" y="60" class="tk-label">${Math.round(f)}</text>`);
  }
  const bandBars = BANDS.map((b) => {
    const x = (b.range[0] - MIN) * PX + 6;
    const w = (b.range[1] - b.range[0]) * PX - 12;
    return `<div class="tuner__band" style="left:${x}px;width:${w}px;--c:${b.hue}"><span>${esc(b.name)}</span></div>`;
  }).join('');
  const markers = sorted.map((s) => {
    const x = (s.freq - MIN) * PX;
    const band = BANDS.find((b) => b.id === s.band);
    return `<button type="button" class="tuner__station" data-freq="${s.freq}" style="left:${x}px;--c:${band ? band.hue : 'var(--signal)'}" tabindex="-1" aria-hidden="true"><i></i><span>${esc(s.title)}</span></button>`;
  }).join('');

  host.innerHTML = `
    <div class="tuner" role="slider" tabindex="0" aria-label="Tuner: drag or use arrow keys to change station"
         aria-valuemin="${MIN}" aria-valuemax="${MAX}">
      <div class="tuner__glass"></div>
      <div class="tuner__tape" style="width:${width}px">
        <div class="tuner__markers">${markers}</div>
        <svg class="tuner__ticks" width="${width}" height="64" viewBox="0 0 ${width} 64" aria-hidden="true">${ticks.join('')}</svg>
        <div class="tuner__bands">${bandBars}</div>
      </div>
      <div class="tuner__needle" aria-hidden="true"><span></span></div>
      <div class="tuner__fade tuner__fade--l"></div><div class="tuner__fade tuner__fade--r"></div>
    </div>`;

  const el = host.querySelector('.tuner');
  const tape = host.querySelector('.tuner__tape');
  const stationEls = [...host.querySelectorAll('.tuner__station')];

  const nearest = (f) => sorted.reduce((best, s) => (Math.abs(s.freq - f) < Math.abs(best.freq - f) ? s : best), sorted[0]);
  const signalAt = (f) => {
    const n = nearest(f);
    return { station: n, signal: Math.max(0, 1 - Math.abs(n.freq - f) / 0.45) };
  };

  function render() {
    const x = el.clientWidth / 2 - (freq - MIN) * PX;
    tape.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
    const { station, signal } = signalAt(freq);
    stationEls.forEach((m) => m.classList.toggle('is-tuned', signal > 0.6 && Number(m.dataset.freq) === station.freq));
    el.setAttribute('aria-valuenow', freq.toFixed(1));
    el.setAttribute('aria-valuetext', signal > 0.6 ? `${station.freq.toFixed(1)} FM, ${station.title}` : `${freq.toFixed(1)} FM, static`);
    el.style.setProperty('--signal', signal.toFixed(3));
    onTune?.(signal > 0.6 ? station : null, freq, signal);
    return { station, signal };
  }

  function set(f) {
    freq = Math.max(MIN, Math.min(MAX, f));
    const { signal } = render();
    if (dragging || anim) setStatic(1 - signal);
  }

  function animateTo(target, after) {
    cancelAnimationFrame(anim);
    if (prefersReducedMotion()) { set(target); anim = null; after?.(); return; }
    const from = freq;
    const dist = Math.abs(target - from);
    const dur = Math.min(900, 260 + dist * 110);
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      set(from + (target - from) * e);
      if (p < 1) anim = requestAnimationFrame(step);
      else { anim = null; setStatic(0); after?.(); }
    };
    anim = requestAnimationFrame(step);
  }

  function lockTo(station, { silent = false } = {}) {
    animateTo(station.freq, () => {
      if (!silent) {
        if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* ignore */ }
        onLock?.(station);
      }
    });
  }

  // Pointer dragging with momentum.
  let startX = 0; let startF = 0; let samples = [];
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    ensureNoise();
    noiseCtx?.resume?.();
    dragging = true;
    cancelAnimationFrame(anim); anim = null;
    startX = e.clientX; startF = freq; samples = [{ x: e.clientX, t: performance.now() }];
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    set(startF - (e.clientX - startX) / PX);
    samples.push({ x: e.clientX, t: performance.now() });
    if (samples.length > 6) samples.shift();
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    const moved = Math.abs(e.clientX - startX);
    // A tap on a station marker tunes straight to it.
    if (moved < 4) {
      const hit = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.classList?.contains('tuner__station'));
      if (hit) { lockTo(sorted.find((s) => s.freq === Number(hit.dataset.freq))); return; }
    }
    const a = samples[0]; const b = samples[samples.length - 1];
    const v = b && a && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0; // px/ms
    const projected = freq - (v * 220) / PX;
    lockTo(nearest(projected));
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  let wheelTimer;
  el.addEventListener('wheel', (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    e.preventDefault();
    ensureNoise();
    cancelAnimationFrame(anim); anim = null;
    dragging = true;
    set(freq + d / PX / 1.4);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { dragging = false; lockTo(nearest(freq)); }, 140);
  }, { passive: false });

  el.addEventListener('keydown', (e) => {
    const idx = sorted.indexOf(nearest(freq));
    let target = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') target = sorted[Math.min(sorted.length - 1, sorted[idx].freq > freq + 0.05 ? idx : idx + 1)];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') target = sorted[Math.max(0, sorted[idx].freq < freq - 0.05 ? idx : idx - 1)];
    else if (e.key === 'Home') target = sorted[0];
    else if (e.key === 'End') target = sorted[sorted.length - 1];
    if (target) { e.preventDefault(); lockTo(target); }
  });

  const ro = new ResizeObserver(() => render());
  ro.observe(el);
  render();

  return {
    tuneTo(slug, opts) { const s = sorted.find((x) => x.slug === slug); if (s) lockTo(s, opts); },
    shuffle() {
      const others = sorted.filter((s) => Math.abs(s.freq - freq) > 0.05);
      ensureNoise(); noiseCtx?.resume?.();
      lockTo(others[Math.floor(Math.random() * others.length)]);
    },
    destroy() { ro.disconnect(); cancelAnimationFrame(anim); setStatic(0); }
  };
}
