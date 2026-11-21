// Reusable markup for episodes ("stations") and tapes.

import { ALL_STATIONS, bandById, findEpisode } from './catalog.js';
import { store, isKept } from './store.js';
import { isSaved, progressOf as dlProgress } from './offline.js';
import { esc, icon, fmtLength, fmtFreq } from './ui.js';

let tapes = [];
export const setTapes = (list) => { tapes = list; };
export const getTapes = () => tapes;
export const resolveEp = (slug) => findEpisode(slug) || tapes.find((t) => t.slug === slug) || null;
export const allPlayable = () => [...ALL_STATIONS, ...tapes];

export function bandOf(ep) {
  return bandById(ep?.band) || null;
}

export function hueOf(ep) {
  const b = bandOf(ep);
  if (b) return b.hue;
  return ep?.isTape ? 'var(--tape)' : 'var(--signal)';
}

export function bandLabel(ep) {
  if (ep.band === 'station') return 'Station ID';
  if (ep.isTape) return 'Your tape';
  return bandOf(ep)?.name || 'EchoHub';
}

export function freqLabel(ep) {
  return ep.freq ? `${fmtFreq(ep.freq)} FM` : 'TAPE';
}

export function progressFraction(ep) {
  const s = store.get();
  if (s.finished.includes(ep.slug) && !(s.progress[ep.slug]?.t > 0)) return 1;
  const p = s.progress[ep.slug];
  if (!p || !p.t) return 0;
  return Math.min(1, p.t / (p.d || ep.seconds || 1));
}

export function statusText(ep) {
  const s = store.get();
  const p = s.progress[ep.slug];
  if (p && p.t > 5) {
    const left = Math.max(0, (p.d || ep.seconds) - p.t);
    return `${Math.max(1, Math.round(left / 60))} min left`;
  }
  if (s.finished.includes(ep.slug)) return 'Played';
  return fmtLength(ep.seconds);
}

// Listening state only (no length), for places that already show the length.
export function listenState(ep) {
  const s = store.get();
  const p = s.progress[ep.slug];
  if (p && p.t > 5) return `${Math.max(1, Math.round(Math.max(0, (p.d || ep.seconds) - p.t) / 60))} min left`;
  if (s.finished.includes(ep.slug)) return 'Played';
  return 'New';
}

export function coverHtml(ep, cls = '') {
  if (ep.cover) {
    return `<img class="cover ${cls}" src="${esc(ep.cover)}" alt="" loading="lazy" decoding="async" width="640" height="640" />`;
  }
  const initials = ep.title.split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || 'T';
  return `<span class="cover cover--tape ${cls}" aria-hidden="true"><span class="cover__reel"></span><b>${esc(initials)}</b><small class="mono">TAPE</small></span>`;
}

export function playBtn(ep, { size = '', label = true } = {}) {
  return `<button type="button" class="pbtn ${size}" data-action="play" data-slug="${esc(ep.slug)}" aria-label="Play ${esc(ep.title)}">${icon('play', size === 'pbtn--sm' ? 16 : 20, 'i-play')}${icon('pause', size === 'pbtn--sm' ? 16 : 20, 'i-pause')}${label ? '' : ''}</button>`;
}

export function keepBtn(ep, extra = '') {
  const on = isKept(ep.slug);
  return `<button type="button" class="ibtn keep ${extra}" data-action="keep" data-keep="${esc(ep.slug)}" aria-pressed="${on}" aria-label="${on ? 'Remove from Kept' : 'Keep'}">${icon('heart', 20, 'i-off')}${icon('heartFill', 20, 'i-on')}</button>`;
}

export function offlineBtn(ep, extra = '') {
  if (ep.isTape || !('caches' in window)) return '';
  const saved = isSaved(ep.audio);
  const prog = dlProgress(ep.audio);
  const state = prog !== null ? 'loading' : saved ? 'saved' : 'idle';
  const label = state === 'saved' ? 'Saved for offline (tap to remove)' : state === 'loading' ? 'Saving…' : 'Save for offline';
  return `<button type="button" class="ibtn dl ${extra}" data-action="offline" data-offline="${esc(ep.slug)}" data-state="${state}" aria-label="${label}" title="${label}" style="--dl:${prog ?? 0}">${icon('download', 20, 'i-idle')}${icon('check', 20, 'i-saved')}<svg class="dl__ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"/></svg></button>`;
}

export function progBar(ep) {
  const f = progressFraction(ep);
  return `<span class="prog ${f ? '' : 'is-empty'}" data-prog="${esc(ep.slug)}" style="--p:${f.toFixed(3)}" aria-hidden="true"><i></i></span>`;
}

export function card(ep, { wide = false } = {}) {
  return `
  <article class="card ${wide ? 'card--wide' : ''}" style="--c:${hueOf(ep)}">
    <div class="card__media">
      <a class="card__art" href="#/ep/${esc(ep.slug)}" tabindex="-1" aria-hidden="true">${coverHtml(ep)}</a>
      ${playBtn(ep, { size: 'pbtn--card' })}
    </div>
    <div class="card__body">
      <p class="card__freq mono"><span>${esc(freqLabel(ep))}</span><span>${esc(bandLabel(ep))}</span></p>
      <h3 class="card__title"><a href="#/ep/${esc(ep.slug)}">${esc(ep.title)}</a></h3>
      <p class="card__meta" data-status="${esc(ep.slug)}">${esc(statusText(ep))}</p>
      ${progBar(ep)}
    </div>
  </article>`;
}

export function row(ep, { showDesc = false, actions = '' } = {}) {
  const href = ep.isTape ? null : `#/ep/${esc(ep.slug)}`;
  const title = href ? `<a href="${href}">${esc(ep.title)}</a>` : `<span>${esc(ep.title)}</span>`;
  return `
  <li class="row" style="--c:${hueOf(ep)}">
    <span class="row__freq mono" aria-hidden="true">${ep.freq ? esc(fmtFreq(ep.freq)) : 'TAPE'}</span>
    <span class="row__art">${coverHtml(ep)}</span>
    <div class="row__text">
      <p class="row__title">${title}</p>
      <p class="row__meta"><span class="row__band">${esc(bandLabel(ep))}</span> · <span data-status="${esc(ep.slug)}">${esc(statusText(ep))}</span></p>
      ${showDesc && ep.description ? `<p class="row__desc">${esc(ep.description)}</p>` : ''}
      ${progBar(ep)}
    </div>
    <div class="row__actions">${actions}${keepBtn(ep, 'row__keep')}${playBtn(ep, { size: 'pbtn--sm' })}</div>
  </li>`;
}

export function emptyState(title, body, cta = '') {
  return `<div class="empty"><div class="empty__rings" aria-hidden="true"><i></i><i></i><i></i></div><h3>${esc(title)}</h3><p>${esc(body)}</p>${cta}</div>`;
}
