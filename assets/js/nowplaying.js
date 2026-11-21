// The deck (mini player) and the Now Playing stage with its echo-ring visualiser.

import { player } from './player.js';
import { store, isKept } from './store.js';
import { esc, icon, fmtClock, fmtFreq, $, $$, prefersReducedMotion } from './ui.js';
import { coverHtml, hueOf, bandLabel, freqLabel, progressFraction, statusText, listenState } from './components.js';

const deck = $('#deck');
const np = $('#np');
const ring = $('#npRing');
const ringFill = $('#npRingFill');
const knob = $('#npKnob');
const canvas = $('#npViz');
let npOpen = false;
let lastFocus = null;
let rafId = null;

export const isNowPlayingOpen = () => npOpen;

// Static icons for chrome buttons
function paintIcons() {
  $('[data-action="skip-back"]', deck).innerHTML = icon('skipBack', 22) + `<span class="skipnum mono">${store.get().settings.skipBack}</span>`;
  $('[data-action="skip-fwd"]', deck).innerHTML = icon('skipFwd', 22) + `<span class="skipnum mono">${store.get().settings.skipFwd}</span>`;
  $('[data-action="queue"]', deck).innerHTML = icon('list', 22);
  $('#deckPlay').innerHTML = icon('play', 22, 'i-play') + icon('pause', 22, 'i-pause');
  $('[data-action="close-np"]', np).innerHTML = icon('down', 24);
  $('[data-action="np-details"]', np).innerHTML = icon('info', 22);
  $('[data-action="prev"]', np).innerHTML = icon('prev', 26);
  $('[data-action="next"]', np).innerHTML = icon('next', 26);
  $$('.skipbtn', np)[0].innerHTML = icon('skipBack', 30) + `<span class="skipnum mono">${store.get().settings.skipBack}</span>`;
  $$('.skipbtn', np)[1].innerHTML = icon('skipFwd', 30) + `<span class="skipnum mono">${store.get().settings.skipFwd}</span>`;
  $('#npPlay').innerHTML = icon('play', 34, 'i-play') + icon('pause', 34, 'i-pause');
  $('#npKeep').innerHTML = icon('heart', 24, 'i-off') + icon('heartFill', 24, 'i-on');
  $('[data-action="close-sheet"]').innerHTML = icon('close', 22);
  paintSleep();
}

function paintSleep() {
  const s = player.sleep;
  const btn = $('.np__timer', np);
  let label = '';
  if (s?.mode === 'end') label = 'End';
  else if (s?.mode === 'time') label = `${Math.max(1, Math.ceil((s.until - Date.now()) / 60000))}m`;
  btn.innerHTML = icon('moon', 22) + (label ? `<span class="mono np__timer-label">${label}</span>` : '');
  btn.classList.toggle('is-on', Boolean(s));
}

export function syncTrack() {
  const ep = player.current;
  if (!ep) { deck.hidden = true; document.body.classList.remove('has-deck'); return; }
  deck.hidden = false;
  document.body.classList.add('has-deck');
  deck.style.setProperty('--c', hueOf(ep));
  np.style.setProperty('--c', hueOf(ep));
  $('#deckCover').innerHTML = coverHtml(ep);
  $('#deckTitle').textContent = ep.title;
  $('#deckMeta').textContent = `${freqLabel(ep)} · ${bandLabel(ep)}`;
  $('#npCover').innerHTML = coverHtml(ep);
  $('#npBg').style.backgroundImage = ep.cover ? `url("${ep.cover}")` : 'none';
  $('#npTitle').textContent = ep.title;
  $('#npMeta').textContent = `${freqLabel(ep)} · ${bandLabel(ep)}`;
  $('#npKicker').textContent = ep.freq ? `Now tuned · ${fmtFreq(ep.freq)}` : 'Now playing · Tape';
  const keep = $('#npKeep');
  keep.dataset.keep = ep.slug;
  keep.dataset.action = 'keep';
  keep.hidden = Boolean(ep.isTape);
  syncKeepButtons();
  syncNext();
  syncTime();
}

export function syncNext() {
  const n = player.upNext();
  const btn = $('#npNext');
  const qlen = store.get().queue.length;
  btn.innerHTML = n
    ? `<span class="mono">${n.fromQueue ? `Up next${qlen > 1 ? ` · ${qlen} queued` : ''}` : 'Then the dial tunes to'}</span><b>${esc(n.ep.title)}</b>${icon('list', 18)}`
    : `<span class="mono">Up next</span><b>Nothing queued</b>${icon('list', 18)}`;
}

export function syncPlayState() {
  const ep = player.current;
  const playing = player.playing;
  document.body.classList.toggle('is-playing', playing);
  for (const b of [$('#deckPlay'), $('#npPlay')]) {
    b.classList.toggle('is-playing', playing);
    b.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  $$('[data-action="play"][data-slug]').forEach((b) => {
    const on = ep && b.dataset.slug === ep.slug && playing;
    b.classList.toggle('is-playing', Boolean(on));
    b.classList.toggle('is-current', Boolean(ep && b.dataset.slug === ep.slug));
    const lbl = b.querySelector('span');
    if (lbl && b.classList.contains('btn')) {
      if (!b.dataset.label) b.dataset.label = lbl.textContent;
      lbl.textContent = on ? 'Pause' : (ep && b.dataset.slug === ep.slug ? 'Resume' : b.dataset.label);
    }
  });
}

export function syncKeepButtons() {
  $$('[data-keep]').forEach((b) => {
    const on = isKept(b.dataset.keep);
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Remove from Kept' : 'Keep');
  });
}

export function syncProgressMarks() {
  $$('[data-prog]').forEach((el) => {
    const ep = { slug: el.dataset.prog, seconds: 1 };
    const s = store.get();
    const p = s.progress[ep.slug];
    let f = 0;
    if (player.current?.slug === ep.slug && player.duration) f = player.time / player.duration;
    else if (p?.t) f = p.t / (p.d || 1);
    else if (s.finished.includes(ep.slug)) f = 1;
    el.style.setProperty('--p', Math.min(1, f).toFixed(3));
    el.classList.toggle('is-empty', !f);
  });
}

export function syncStatus(resolveEp) {
  $$('[data-status]').forEach((el) => {
    const ep = resolveEp(el.dataset.status);
    if (ep) el.textContent = statusText(ep);
  });
  $$('[data-lstate]').forEach((el) => {
    const ep = resolveEp(el.dataset.lstate);
    if (ep) el.textContent = listenState(ep);
  });
}

let lastTimePaint = 0;
export function syncTime(force = false) {
  const now = performance.now();
  if (!force && !npOpen && now - lastTimePaint < 500) return;
  lastTimePaint = now;
  const d = player.duration;
  const t = player.time;
  const f = d ? Math.min(1, t / d) : 0;
  $('#deckBar').style.transform = `scaleX(${f})`;
  $('#npCur').textContent = fmtClock(t);
  $('#npLeft').textContent = `-${fmtClock(Math.max(0, d - t))}`;
  ringFill.style.strokeDashoffset = String(1000 - f * 1000);
  const a = f * Math.PI * 2 - Math.PI / 2;
  knob.style.transform = `translate(${(Math.cos(a) * 48).toFixed(3)}cqw, ${(Math.sin(a) * 48).toFixed(3)}cqw)`;
  ring.setAttribute('aria-valuemax', String(Math.round(d)));
  ring.setAttribute('aria-valuenow', String(Math.round(t)));
  ring.setAttribute('aria-valuetext', `${fmtClock(t)} of ${fmtClock(d)}`);
}

export function syncRate() {
  const r = player.rate;
  const label = `${Number.isInteger(r) ? r : r.toString().replace(/^0/, '')}×`;
  $$('[data-action="rate"]').forEach((b) => { b.textContent = label; b.classList.toggle('is-on', r !== 1); });
}

// ---- Open / close -------------------------------------------------------
export function openNowPlaying() {
  if (!player.current || npOpen) return;
  npOpen = true;
  lastFocus = document.activeElement;
  np.hidden = false;
  document.body.classList.add('np-open');
  requestAnimationFrame(() => np.classList.add('is-open'));
  syncTime(true);
  startViz();
  setTimeout(() => $('[data-action="close-np"]', np).focus(), 60);
}

export function closeNowPlaying() {
  if (!npOpen) return;
  npOpen = false;
  np.classList.remove('is-open');
  document.body.classList.remove('np-open');
  stopViz();
  setTimeout(() => { if (!npOpen) np.hidden = true; }, 380);
  lastFocus?.focus?.();
}

// Swipe down to dismiss on touch devices.
(() => {
  let y0 = null;
  np.addEventListener('touchstart', (e) => { if (e.target.closest('.np__ring')) return; y0 = e.touches[0].clientY; }, { passive: true });
  np.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) np.style.transform = `translateY(${dy * 0.6}px)`;
  }, { passive: true });
  np.addEventListener('touchend', (e) => {
    if (y0 === null) return;
    const dy = e.changedTouches[0].clientY - y0;
    np.style.transform = '';
    y0 = null;
    if (dy > 120) closeNowPlaying();
  });
})();

// ---- Ring scrubber ------------------------------------------------------
(() => {
  let scrubbing = false;
  const angleToFraction = (e) => {
    const r = ring.getBoundingClientRect();
    const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
    let a = Math.atan2(e.clientY - cy, e.clientX - cx) + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    return a / (Math.PI * 2);
  };
  const onRing = (e) => {
    const r = ring.getBoundingClientRect();
    const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    return dist > r.width * 0.36;
  };
  ring.addEventListener('pointerdown', (e) => {
    if (!onRing(e) || !player.current) return;
    scrubbing = true;
    ring.setPointerCapture(e.pointerId);
    ring.classList.add('is-scrubbing');
    player.seek(angleToFraction(e) * player.duration);
  });
  ring.addEventListener('pointermove', (e) => {
    if (!scrubbing) return;
    player.seek(angleToFraction(e) * player.duration);
    syncTime(true);
  });
  const end = () => { scrubbing = false; ring.classList.remove('is-scrubbing'); };
  ring.addEventListener('pointerup', end);
  ring.addEventListener('pointercancel', end);
  ring.addEventListener('keydown', (e) => {
    const s = store.get().settings;
    const map = { ArrowRight: s.skipFwd, ArrowUp: s.skipFwd, ArrowLeft: -s.skipBack, ArrowDown: -s.skipBack, PageUp: 60, PageDown: -60 };
    if (e.key in map) { e.preventDefault(); e.stopPropagation(); player.skip(map[e.key]); }
    if (e.key === 'Home') { e.preventDefault(); player.seek(0); }
  });
})();

// ---- Visualiser ---------------------------------------------------------
const rings = [];
let lastLevel = 0;
let lastSpawn = 0;

function startViz() {
  cancelAnimationFrame(rafId);
  const ctx = canvas.getContext('2d');
  const reduce = prefersReducedMotion();
  const draw = (now) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2; const cy = h / 2;
    const ringR = ring.clientWidth / 2;
    const color = getComputedStyle(np).getPropertyValue('--viz').trim() || '#ff6b3d';
    const playing = player.playing;

    // Level: real analyser where available; otherwise a gentle procedural pulse.
    let level = player.hasAnalyser ? player.level() : (playing ? 0.28 + 0.18 * Math.sin(now / 260) * Math.sin(now / 410) : 0);
    level = lastLevel * 0.7 + level * 0.3;

    // Radial frequency corona.
    const bands = player.hasAnalyser && playing ? player.bands(72) : null;
    const N = 72;
    ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      const v = bands ? bands[i < N / 2 ? i * 2 : (N - i) * 2 - 1] || 0 : (playing ? 0.15 + 0.12 * Math.sin(now / 300 + i * 0.6) * Math.cos(now / 520 + i * 0.25) : 0.04);
      const len = 4 + v * Math.min(70, ringR * 0.45);
      const r0 = ringR + 12;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.25 + v * 0.7;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      ctx.stroke();
    }

    // Echo rings spawn on peaks and drift outward.
    if (!reduce && playing && level - lastLevel > 0.012 && now - lastSpawn > 260) {
      rings.push({ r: ringR + 14, a: Math.min(0.9, 0.35 + level) });
      lastSpawn = now;
    }
    if (!reduce && playing && now - lastSpawn > 1400) { rings.push({ r: ringR + 14, a: 0.35 }); lastSpawn = now; }
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i];
      rg.r += 0.9 + level * 2.2;
      rg.a *= 0.982;
      if (rg.a < 0.02 || rg.r > Math.max(w, h)) { rings.splice(i, 1); continue; }
      ctx.globalAlpha = rg.a * 0.6;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, rg.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    lastLevel = level;
    np.style.setProperty('--level', level.toFixed(3));
    if (player.sleep?.mode === 'time' && Math.floor(now / 1000) !== Math.floor((now - 16) / 1000)) paintSleep();
    rafId = requestAnimationFrame(draw);
  };
  rafId = requestAnimationFrame(draw);
}

function stopViz() { cancelAnimationFrame(rafId); rings.length = 0; }

export function initNowPlaying() {
  paintIcons();
  player.on('sleep', paintSleep);
  store.subscribe((topic) => { if (topic === 'settings') paintIcons(); });
}

export { paintSleep, progressFraction };
