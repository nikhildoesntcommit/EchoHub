// Modal sheets: settings, queue, sleep timer, shortcuts, add-a-tape.

import { BANDS } from './catalog.js';
import { store } from './store.js';
import { player } from './player.js';
import { clearOffline } from './offline.js';
import { saveTape, probeDuration } from './uploads.js';
import { esc, icon, fmtClock, fmtLength, toast, $, $$ } from './ui.js';
import { coverHtml, resolveEp, hueOf, freqLabel } from './components.js';

const sheet = $('#sheet');
const body = $('#sheetBody');
let current = null;
let onCloseFn = null;

export const sheetOpen = () => sheet.open;
export const currentSheet = () => (sheet.open ? current : null);

export function openSheet(name, title, html, mount) {
  current = name;
  $('#sheetTitle').textContent = title;
  body.innerHTML = html;
  sheet.dataset.sheet = name;
  if (!sheet.open) sheet.showModal();
  onCloseFn = mount?.(body) || null;
}

export function closeSheet() {
  if (sheet.open) sheet.close();
}

sheet.addEventListener('close', () => { onCloseFn?.(); onCloseFn = null; current = null; });
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

// ---------------------------------------------------------------- Settings
let deferredInstall = null;
export const setInstallPrompt = (e) => { deferredInstall = e; };
export const getInstallPrompt = () => deferredInstall;

export async function openSettings() {
  const s = store.get().settings;
  const seg = (name, value, options) => `<div class="seg" role="radiogroup" aria-label="${esc(name)}">${options.map(([v, l]) => `<label><input type="radio" name="${esc(name)}" value="${esc(v)}" ${String(value) === String(v) ? 'checked' : ''} /><span>${esc(l)}</span></label>`).join('')}</div>`;
  const toggle = (key, label, hint) => `<label class="toggle"><span><b>${esc(label)}</b><small>${esc(hint)}</small></span><input type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''} /><i aria-hidden="true"></i></label>`;
  let usage = '';
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage) usage = `${(est.usage / 1024 / 1024).toFixed(1)} MB used on this device`;
  } catch { /* ignore */ }
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  openSheet('settings', 'Settings', `
    <section class="set">
      <h3 class="set__h mono">Appearance</h3>
      ${seg('theme', s.theme, [['system', 'Auto'], ['dark', 'Night'], ['light', 'Day']])}
    </section>
    <section class="set">
      <h3 class="set__h mono">Listening</h3>
      ${toggle('autoplay', 'Keep the dial playing', 'When an episode ends, tune to the next one you haven’t heard.')}
      ${toggle('dialSound', 'Static between stations', 'A soft hiss while you drag the tuner.')}
      <div class="set__row"><span><b>Skip back</b></span>${seg('skipBack', s.skipBack, [[10, '10s'], [15, '15s'], [30, '30s']])}</div>
      <div class="set__row"><span><b>Skip forward</b></span>${seg('skipFwd', s.skipFwd, [[15, '15s'], [30, '30s'], [45, '45s']])}</div>
    </section>
    ${standalone ? '' : `<section class="set">
      <h3 class="set__h mono">Install</h3>
      ${deferredInstall ? `<button type="button" class="btn btn--signal" data-action="install">${icon('download', 18)}<span>Install EchoHub</span></button>`
        : `<p class="muted">${isIOS ? 'In Safari, tap Share, then “Add to Home Screen”.' : 'Use your browser’s “Install app” or “Add to Home screen” option to put EchoHub on your device.'}</p>`}
    </section>`}
    <section class="set">
      <h3 class="set__h mono">Storage</h3>
      ${usage ? `<p class="muted">${esc(usage)}</p>` : ''}
      <div class="set__btns">
        <button type="button" class="btn btn--ghost btn--sm" data-set-action="clear-offline">Remove downloads</button>
        <button type="button" class="btn btn--ghost btn--sm" data-set-action="clear-history">Clear history &amp; progress</button>
        <button type="button" class="btn btn--danger btn--sm" data-set-action="reset">Erase everything</button>
      </div>
    </section>
    <p class="mono muted set__foot">EchoHub 2.1 · Everything stays on this device.</p>
  `, (root) => {
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'theme') store.update((st) => { st.settings.theme = t.value; }, 'settings');
      if (t.name === 'skipBack' || t.name === 'skipFwd') store.update((st) => { st.settings[t.name] = Number(t.value); }, 'settings');
      if (t.dataset.setting) store.update((st) => { st.settings[t.dataset.setting] = t.checked; }, 'settings');
    });
    root.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-set-action]')?.dataset.setAction;
      if (!a) return;
      if (a === 'clear-offline') { await clearOffline(); toast('Downloads removed'); }
      if (a === 'clear-history' && confirm('Clear listening history, progress and stats?')) {
        store.update((st) => { st.history = []; st.progress = {}; st.finished = []; st.listenLog = {}; st.bandSeconds = {}; }, 'history');
        toast('History cleared');
      }
      if (a === 'reset' && confirm('Erase all EchoHub data on this device? Kept stations, drafts, downloads and settings will be removed. Your tapes are kept.')) {
        player.pause();
        await clearOffline();
        store.reset();
        closeSheet();
        toast('EchoHub has been reset');
        location.hash = '#/';
      }
    });
  });
}

// ---------------------------------------------------------------- Queue
export function openQueue() {
  const render = () => {
    const q = store.get().queue.map(resolveEp).filter(Boolean);
    const cur = player.current;
    const next = player.upNext();
    return `
      ${cur ? `<p class="set__h mono">Now playing</p><div class="qrow qrow--now" style="--c:${hueOf(cur)}">${coverHtml(cur)}<span><b>${esc(cur.title)}</b><small class="mono">${esc(freqLabel(cur))} · ${fmtClock(player.time)} / ${fmtClock(player.duration)}</small></span></div>` : ''}
      <div class="set__h mono qhead"><span>Up next</span>${q.length ? '<button type="button" class="link" data-q="clear">Clear</button>' : ''}</div>
      ${q.length ? `<ol class="qlist">${q.map((e, i) => `<li class="qrow" style="--c:${hueOf(e)}">${coverHtml(e)}<span><b>${esc(e.title)}</b><small class="mono">${esc(freqLabel(e))} · ${esc(fmtLength(e.seconds))}</small></span>
        <span class="qrow__btns">
          <button type="button" class="ibtn" data-q="up" data-slug="${esc(e.slug)}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up', 18)}</button>
          <button type="button" class="ibtn" data-q="down" data-slug="${esc(e.slug)}" ${i === q.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down', 18)}</button>
          <button type="button" class="ibtn" data-q="remove" data-slug="${esc(e.slug)}" aria-label="Remove">${icon('close', 18)}</button>
        </span></li>`).join('')}</ol>`
        : '<p class="muted">Your queue is empty. Use the <b>+</b> button on any episode page to line it up here.</p>'}
      ${next && !next.fromQueue ? `<p class="muted qauto">${icon('dial', 16)} Then the dial tunes to <b>${esc(next.ep.title)}</b>.</p>` : ''}
      ${!store.get().settings.autoplay ? '<p class="muted qauto">“Keep the dial playing” is off in Settings.</p>' : ''}`;
  };
  openSheet('queue', 'Up next', render(), (root) => {
    const onClick = (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      const { q, slug } = b.dataset;
      if (q === 'clear') player.clearQueue();
      if (q === 'up') player.moveInQueue(slug, -1);
      if (q === 'down') player.moveInQueue(slug, 1);
      if (q === 'remove') player.dequeue(slug);
      root.innerHTML = render();
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  });
}

export function refreshQueueSheet() {
  if (currentSheet() === 'queue') openQueue();
}

// ---------------------------------------------------------------- Sleep
export function openSleep() {
  const s = player.sleep;
  const opts = [[0, 'Off'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], ['end', 'End of episode']];
  const active = s ? (s.mode === 'end' ? 'end' : null) : 0;
  openSheet('sleep', 'Sleep timer', `
    ${s?.mode === 'time' ? `<p class="muted">Fading out in about ${Math.max(1, Math.ceil((s.until - Date.now()) / 60000))} min.</p>` : ''}
    <ul class="menu">${opts.map(([v, l]) => `<li><button type="button" data-sleep="${v}" class="${active === v ? 'is-on' : ''}">${esc(l)}${active === v ? icon('check', 18) : ''}</button></li>`).join('')}</ul>
  `, (root) => {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sleep]');
      if (!b) return;
      const v = b.dataset.sleep === 'end' ? 'end' : Number(b.dataset.sleep);
      player.setSleep(v);
      closeSheet();
      toast(v === 0 ? 'Sleep timer off' : v === 'end' ? 'Stopping at the end of this episode' : `Sleep timer set for ${v} min`);
    });
  });
}

// ---------------------------------------------------------------- Shortcuts
export function openShortcuts() {
  const k = (x) => `<kbd>${esc(x)}</kbd>`;
  const or = '<span>or</span>';
  const keys = [
    [`${k('Space')} ${or} ${k('K')}`, 'Play or pause'],
    [`${k('J')} ${k('L')}`, 'Skip back / forward'],
    [`${k('Shift')}+${k('N')} ${k('Shift')}+${k('P')}`, 'Next / previous'],
    [k('F'), 'Keep the current station'],
    [k('S'), 'Change speed'],
    [k('/'), 'Search'],
    [k('T'), 'Surprise me (tune the dial)'],
    [k('M'), 'Open now playing'],
    [`${k('G')} <span>then</span> ${k('L')} ${k('S')} ${k('T')} ${k('B')}`, 'Go to Listen, Search, Studio, Library'],
    [k('Esc'), 'Close panels'],
    [k('?'), 'This list']
  ];
  openSheet('shortcuts', 'Keyboard shortcuts', `<dl class="keys">${keys.map(([dt, d]) => `<div><dt>${dt}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl>`);
}

// ---------------------------------------------------------------- Upload
export function openUpload(onSaved) {
  openSheet('upload', 'Add a tape', `
    <form class="form" id="tapeForm" novalidate>
      <label class="drop" id="drop">
        <input type="file" id="tapeFile" accept="audio/*" required />
        <span class="drop__icon">${icon('upload', 28)}</span>
        <b id="dropLabel">Choose an audio file</b>
        <small class="muted">MP3, M4A, WAV or OGG · stays on this device</small>
      </label>
      <label class="field"><span>Title</span><input id="tapeTitle" type="text" maxlength="90" required placeholder="Name your tape" /></label>
      <div class="field"><span>Band</span>
        <div class="seg seg--wrap" role="radiogroup" aria-label="Band">
          ${BANDS.map((b, i) => `<label style="--c:${b.hue}"><input type="radio" name="band" value="${b.id}" ${i === 0 ? 'checked' : ''} /><span>${esc(b.name)}</span></label>`).join('')}
          <label style="--c:var(--tape)"><input type="radio" name="band" value="tape" /><span>Other</span></label>
        </div>
      </div>
      <label class="field"><span>Tags <small class="muted">(optional, comma separated)</small></span><input id="tapeTags" type="text" placeholder="lecture, physics, revision" /></label>
      <label class="field"><span>Notes <small class="muted">(optional)</small></span><textarea id="tapeDesc" rows="3" maxlength="400" placeholder="What’s on this tape?"></textarea></label>
      <p class="form__err" id="tapeErr" role="alert"></p>
      <div class="form__actions">
        <button type="button" class="btn btn--ghost" data-action="close-sheet">Cancel</button>
        <button type="submit" class="btn btn--signal" id="tapeSave">Save tape</button>
      </div>
    </form>`, (root) => {
    const file = $('#tapeFile', root);
    const title = $('#tapeTitle', root);
    const err = $('#tapeErr', root);
    let seconds = 0;
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      $('#dropLabel', root).textContent = f.name;
      $('#drop', root).classList.add('is-filled');
      if (!title.value) title.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      seconds = await probeDuration(f);
      if (seconds) $('#dropLabel', root).textContent = `${f.name} · ${fmtClock(seconds)}`;
    });
    $('#tapeForm', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const f = file.files[0];
      if (!f) { err.textContent = 'Choose an audio file first.'; return; }
      if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(f.name)) { err.textContent = 'That doesn’t look like an audio file.'; return; }
      if (!title.value.trim()) { err.textContent = 'Give your tape a title.'; title.focus(); return; }
      const btn = $('#tapeSave', root);
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        await saveTape({
          file: f,
          title: title.value.trim(),
          band: root.querySelector('input[name="band"]:checked')?.value || 'tape',
          tags: $('#tapeTags', root).value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 6),
          description: $('#tapeDesc', root).value.trim(),
          seconds
        });
        closeSheet();
        toast('Tape saved');
        onSaved?.();
      } catch (ex) {
        err.textContent = ex?.name === 'QuotaExceededError' ? 'Not enough storage space on this device.' : 'Couldn’t save that tape. Your browser may be blocking storage.';
        btn.disabled = false; btn.textContent = 'Save tape';
      }
    });
  });
}
