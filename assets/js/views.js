// Route views. Each returns { title, html, mount?(root) -> cleanup? }.

import { BANDS, EPISODES, STATION_ID, ALL_STATIONS, TEAM, bandById, findEpisode } from './catalog.js';
import { store, getStats, isKept } from './store.js';
import { isSaved } from './offline.js';
import { player } from './player.js';
import { createTuner } from './tuner.js';
import { buildDraft, SUGGESTIONS, createSpeaker, speechSupported, voicesReady, defaultVoicePair, draftToText, HOSTS } from './studio.js';
import { esc, icon, fmtLength, fmtFreq, fmtHours, fmtClock, toast, $, $$ } from './ui.js';
import {
  card, row, coverHtml, playBtn, keepBtn, offlineBtn, hueOf, bandLabel, freqLabel, statusText,
  progressFraction, getTapes, resolveEp, emptyState, progBar, listenState
} from './components.js';

const DIAL = [...ALL_STATIONS].sort((a, b) => a.freq - b.freq);

function dailyPick() {
  const d = new Date();
  const seed = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  return EPISODES[(seed * 7) % EPISODES.length];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function sectionHead(kicker, title, link = '') {
  return `<header class="sec__head"><div><p class="kicker mono">${esc(kicker)}</p><h2 class="sec__title">${esc(title)}</h2></div>${link}</header>`;
}

// ---------------------------------------------------------------- Listen
export function viewListen() {
  const s = store.get();
  const start = findEpisode(s.lastStation) && findEpisode(s.lastStation).freq ? findEpisode(s.lastStation) : dailyPick();
  const inProgress = Object.entries(s.progress)
    .map(([slug, p]) => ({ ep: resolveEp(slug), p }))
    .filter(({ ep, p }) => ep && p.t > 5 && p.t < (p.d || ep.seconds) - 10)
    .sort((a, b) => b.p.at - a.p.at)
    .slice(0, 8)
    .map((x) => x.ep);
  const daily = dailyPick();
  const stats = getStats();
  const quick = EPISODES.filter((e) => e.seconds <= 200).sort((a, b) => a.seconds - b.seconds);
  const date = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  const html = `
  <section class="hello">
    <p class="kicker mono">${esc(date)} <span class="dot"></span> ${EPISODES.length} stations on air</p>
    <h1 class="display">${esc(greeting())}.<br /><span class="display__soft">Tune into something new.</span></h1>
  </section>

  <section class="radio" id="radio" style="--c:${hueOf(start)}">
    <div class="radio__face">
      <div class="lcd" aria-live="polite">
        <div class="lcd__art" id="lcdArt">${coverHtml(start)}</div>
        <div class="lcd__read">
          <p class="lcd__freq mono"><span id="lcdFreq">${fmtFreq(start.freq)}</span><small>FM</small></p>
          <p class="lcd__band mono" id="lcdBand">${esc(bandLabel(start))} · ${esc(fmtLength(start.seconds))}</p>
        </div>
        <div class="lcd__signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="radio__now">
        <h2 class="radio__title" id="lcdTitle">${esc(start.title)}</h2>
        <p class="radio__desc" id="lcdDesc">${esc(start.description)}</p>
        <div class="radio__actions">
          <button type="button" class="btn btn--signal" id="radioPlay" data-action="play" data-slug="${esc(start.slug)}">${icon('play', 18, 'i-play')}${icon('pause', 18, 'i-pause')}<span>Play</span></button>
          <a class="btn btn--ghost" id="radioMore" href="#/ep/${esc(start.slug)}">Details</a>
          <button type="button" class="btn btn--ghost" data-action="tune-shuffle">${icon('shuffle', 18)}<span>Surprise me</span></button>
        </div>
      </div>
    </div>
    <div class="radio__dial" id="tunerHost"></div>
    <p class="radio__hint mono">${s.onboarded ? 'Drag the dial · arrow keys to step' : '<b>New here?</b> Drag the dial. Every station is a 2–6 minute idea.'}</p>
  </section>

  ${inProgress.length ? `
  <section class="sec">
    ${sectionHead('Resume', 'Pick up where you left off')}
    <div class="shelf">${inProgress.map((e) => card(e)).join('')}</div>
  </section>` : ''}

  <section class="sec sec--split">
    <article class="daily" style="--c:${hueOf(daily)}">
      <a class="daily__art" href="#/ep/${esc(daily.slug)}" tabindex="-1" aria-hidden="true">${coverHtml(daily)}</a>
      <div class="daily__body">
        <p class="kicker mono">Today’s frequency · ${fmtFreq(daily.freq)} FM</p>
        <h2 class="daily__title"><a href="#/ep/${esc(daily.slug)}">${esc(daily.title)}</a></h2>
        <p class="daily__desc">${esc(daily.description)}</p>
        <div class="daily__actions">${playBtn(daily)}<span class="mono daily__len" data-status="${esc(daily.slug)}">${esc(statusText(daily))}</span>${keepBtn(daily)}</div>
      </div>
    </article>
    <a class="pulse" href="#/library">
      <p class="kicker mono">Your week</p>
      <div class="pulse__bars" aria-hidden="true">${weekBars(stats.week)}</div>
      <p class="pulse__line"><b>${esc(fmtHours(stats.week.reduce((a, d) => a + d.seconds, 0)))}</b> listened${stats.streak ? ` · <b>${stats.streak}</b>-day streak` : ' · listen a minute a day to start a streak'}</p>
      <span class="pulse__go">${icon('chevron', 18)}</span>
    </a>
  </section>

  <section class="sec">
    ${sectionHead('Bands', 'Browse by band')}
    <div class="bands">
      ${BANDS.map((b) => {
        const eps = EPISODES.filter((e) => e.band === b.id);
        return `<a class="band" href="#/band/${b.id}" style="--c:${b.hue}">
          <span class="band__range mono">${b.range[0]}–${b.range[1]} FM</span>
          <span class="band__name">${esc(b.name)}</span>
          <span class="band__count mono">${eps.length} stations · ${Math.round(eps.reduce((a, e) => a + e.seconds, 0) / 60)} min</span>
          <span class="band__wave" aria-hidden="true"></span>
        </a>`;
      }).join('')}
    </div>
  </section>

  <section class="sec">
    ${sectionHead('Quick listens', 'Under three minutes')}
    <div class="shelf">${quick.map((e) => card(e)).join('')}</div>
  </section>

  <section class="sec">
    ${sectionHead('The full dial', 'Every station', `<a class="link mono" href="#/search">Search ${icon('chevron', 16)}</a>`)}
    <ol class="rows">${DIAL.map((e) => row(e)).join('')}</ol>
  </section>`;

  return {
    title: 'Listen',
    html,
    mount(root) {
      const radio = $('#radio', root);
      const els = { freq: $('#lcdFreq', root), band: $('#lcdBand', root), title: $('#lcdTitle', root), desc: $('#lcdDesc', root), art: $('#lcdArt', root), play: $('#radioPlay', root), more: $('#radioMore', root) };
      let shown = start.slug;
      const show = (ep) => {
        if (shown === ep.slug) return;
        shown = ep.slug;
        radio.style.setProperty('--c', hueOf(ep));
        els.band.textContent = `${bandLabel(ep)} · ${fmtLength(ep.seconds)}`;
        els.title.textContent = ep.title;
        els.desc.textContent = ep.description;
        els.art.innerHTML = coverHtml(ep);
        els.play.dataset.slug = ep.slug;
        els.more.href = `#/ep/${ep.slug}`;
        document.dispatchEvent(new CustomEvent('echo:sync'));
      };
      const tuner = createTuner($('#tunerHost', root), DIAL, {
        value: start.freq,
        onTune(station, freq, signal) {
          els.freq.textContent = freq.toFixed(1);
          radio.classList.toggle('is-static', !station);
          radio.style.setProperty('--sig', signal.toFixed(2));
          if (station) show(station);
        },
        onLock(station) {
          store.update((st) => { st.lastStation = station.slug; st.onboarded = true; }, 'tune');
        }
      });
      const onShuffle = () => tuner.shuffle();
      document.addEventListener('echo:shuffle', onShuffle);
      return () => { tuner.destroy(); document.removeEventListener('echo:shuffle', onShuffle); };
    }
  };
}

function weekBars(week) {
  const max = Math.max(600, ...week.map((d) => d.seconds));
  const today = week[week.length - 1].key;
  return week.map((d) => `<span class="${d.key === today ? 'is-today' : ''}" style="--h:${(d.seconds / max).toFixed(3)}" title="${esc(fmtHours(d.seconds))}"><i></i><em class="mono">${esc(d.label)}</em></span>`).join('');
}

// ---------------------------------------------------------------- Band
export function viewBand(id) {
  const b = bandById(id);
  if (!b) return viewNotFound();
  const eps = EPISODES.filter((e) => e.band === id).sort((a, c) => a.freq - c.freq);
  const total = eps.reduce((a, e) => a + e.seconds, 0);
  return {
    title: b.name,
    html: `
    <section class="bandhero" style="--c:${b.hue}">
      <a class="back mono" href="#/">${icon('back', 16)} Dial</a>
      <p class="kicker mono">${b.range[0]}–${b.range[1]} FM</p>
      <h1 class="display">${esc(b.name)}</h1>
      <p class="bandhero__blurb">${esc(b.blurb)}</p>
      <div class="bandhero__actions">
        <button type="button" class="btn btn--signal" data-action="play-band" data-band="${b.id}">${icon('play', 18)}<span>Play the band</span></button>
        <span class="mono muted">${eps.length} stations · ${Math.round(total / 60)} min</span>
      </div>
      <div class="bandhero__waves" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    </section>
    <section class="sec"><ol class="rows rows--roomy">${eps.map((e) => row(e, { showDesc: true })).join('')}</ol></section>
    <section class="sec">
      ${sectionHead('Other bands', 'Keep exploring')}
      <div class="bands bands--compact">${BANDS.filter((x) => x.id !== id).map((x) => `<a class="band" href="#/band/${x.id}" style="--c:${x.hue}"><span class="band__range mono">${x.range[0]}–${x.range[1]} FM</span><span class="band__name">${esc(x.name)}</span><span class="band__wave" aria-hidden="true"></span></a>`).join('')}</div>
    </section>`
  };
}

// ---------------------------------------------------------------- Episode
export function viewEpisode(slug, query) {
  const ep = resolveEp(slug);
  if (!ep) return viewNotFound();
  const t = Number(query.get('t')) || 0;
  const idx = DIAL.findIndex((e) => e.slug === ep.slug);
  const nearby = idx >= 0 ? [-2, -1, 1, 2].map((d) => DIAL[(idx + d + DIAL.length) % DIAL.length]) : EPISODES.slice(0, 4);
  const p = store.get().progress[ep.slug];
  const resume = t || (p && p.t > 5 && p.t < (p.d || ep.seconds) - 10 ? p.t : 0);

  return {
    title: ep.title,
    html: `
    <article class="ep" style="--c:${hueOf(ep)}">
      <div class="ep__glow" aria-hidden="true"></div>
      <a class="back mono" href="#/" data-action="back">${icon('back', 16)} Back</a>
      <div class="ep__hero">
        <div class="ep__art">${coverHtml(ep)}</div>
        <div class="ep__info">
          <p class="kicker mono">${esc(freqLabel(ep))} · ${esc(bandLabel(ep))}</p>
          <h1 class="ep__title">${esc(ep.title)}</h1>
          <p class="ep__meta mono"><span>${esc(fmtLength(ep.seconds))}</span><span data-lstate="${esc(ep.slug)}">${esc(listenState(ep))}</span></p>
          ${progBar(ep)}
          <p class="ep__desc">${esc(ep.description)}</p>
          <ul class="tags">${(ep.tags || []).map((g) => `<li><a href="#/search?q=${encodeURIComponent(g)}">#${esc(g)}</a></li>`).join('')}</ul>
          <div class="ep__actions">
            <button type="button" class="btn btn--signal btn--lg" data-action="play" data-slug="${esc(ep.slug)}" ${resume ? `data-at="${Math.floor(resume)}"` : ''}>${icon('play', 20, 'i-play')}${icon('pause', 20, 'i-pause')}<span>${resume ? `Resume from ${fmtClock(resume)}` : 'Play episode'}</span></button>
            <button type="button" class="ibtn ibtn--box" data-action="enqueue" data-slug="${esc(ep.slug)}" aria-label="Add to up next" title="Add to up next">${icon('queue')}</button>
            ${keepBtn(ep, 'ibtn--box')}
            ${offlineBtn(ep, 'ibtn--box')}
            <button type="button" class="ibtn ibtn--box" data-action="share" data-slug="${esc(ep.slug)}" aria-label="Share" title="Share">${icon('share')}</button>
          </div>
        </div>
      </div>
    </article>
    <section class="sec">
      ${sectionHead('Nearby on the dial', 'Stations next door')}
      <div class="shelf">${nearby.map((e) => card(e)).join('')}</div>
    </section>`
  };
}

// ---------------------------------------------------------------- Search
export function viewSearch(query) {
  const q = query.get('q') || '';
  const bandFilter = query.get('band') || 'all';
  const allTags = [...new Set(EPISODES.flatMap((e) => e.tags))].sort();
  return {
    title: 'Search',
    html: `
    <section class="searchhead">
      <p class="kicker mono">Scan the airwaves</p>
      <label class="searchbox">
        ${icon('search', 22)}
        <input id="q" type="search" placeholder="Topics, tags, places…" value="${esc(q)}" autocomplete="off" enterkeyhint="search" aria-label="Search episodes" />
        <kbd class="mono">/</kbd>
      </label>
      <div class="chips" role="group" aria-label="Filter by band">
        <button type="button" class="chip ${bandFilter === 'all' ? 'is-on' : ''}" data-band="all">All</button>
        ${BANDS.map((b) => `<button type="button" class="chip ${bandFilter === b.id ? 'is-on' : ''}" data-band="${b.id}" style="--c:${b.hue}">${esc(b.name)}</button>`).join('')}
        ${getTapes().length ? `<button type="button" class="chip ${bandFilter === 'tapes' ? 'is-on' : ''}" data-band="tapes" style="--c:var(--tape)">Your tapes</button>` : ''}
      </div>
    </section>
    <section class="sec" id="results" aria-live="polite"></section>
    <section class="sec" id="tagcloud">
      ${sectionHead('Frequencies people tune', 'Try a tag')}
      <ul class="tags tags--cloud">${allTags.map((g) => `<li><button type="button" data-tag="${esc(g)}">#${esc(g)}</button></li>`).join('')}</ul>
    </section>`,
    mount(root) {
      const input = $('#q', root);
      const results = $('#results', root);
      let band = bandFilter;
      const run = () => {
        const term = input.value.trim().toLowerCase();
        const pool = band === 'tapes' ? getTapes() : [...ALL_STATIONS, ...getTapes()].filter((e) => band === 'all' || e.band === band);
        const terms = term.split(/\s+/).filter(Boolean);
        const scored = pool.map((e) => {
          const hay = { title: e.title.toLowerCase(), tags: (e.tags || []).join(' ').toLowerCase(), desc: (e.description || '').toLowerCase(), band: bandLabel(e).toLowerCase(), freq: e.freq ? fmtFreq(e.freq) : '' };
          let s = terms.length ? 0 : 1;
          for (const t of terms) {
            let hit = 0;
            if (hay.title.includes(t)) hit += 10;
            if (hay.tags.includes(t)) hit += 7;
            if (hay.band.includes(t)) hit += 5;
            if (hay.desc.includes(t)) hit += 3;
            if (hay.freq.startsWith(t)) hit += 8;
            if (!hit) return { e, s: 0 };
            s += hit;
          }
          return { e, s };
        }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || (a.e.freq || 999) - (b.e.freq || 999));
        const count = scored.length;
        results.innerHTML = (term || band !== 'all')
          ? (count ? `<p class="mono muted results__count">${count} station${count === 1 ? '' : 's'} found</p><ol class="rows">${scored.map((x) => row(x.e, { showDesc: true })).join('')}</ol>`
            : emptyState('Just static here', 'No stations match that yet. Try a broader word, or make your own episode in the Studio.', `<a class="btn btn--ghost" href="#/studio">Open Studio</a>`))
          : '';
        $('#tagcloud', root).hidden = Boolean(term);
        const params = new URLSearchParams();
        if (term) params.set('q', input.value.trim());
        if (band !== 'all') params.set('band', band);
        const next = `#/search${params.toString() ? `?${params}` : ''}`;
        if (location.hash !== next) history.replaceState(null, '', next);
        document.dispatchEvent(new CustomEvent('echo:sync'));
      };
      input.addEventListener('input', run);
      root.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-band]');
        if (chip && chip.classList.contains('chip')) {
          band = chip.dataset.band;
          $$('.chip', root).forEach((c) => c.classList.toggle('is-on', c === chip));
          run();
        }
        const tag = e.target.closest('[data-tag]');
        if (tag) { input.value = tag.dataset.tag; run(); input.focus(); }
      });
      run();
      if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => input.focus({ preventScroll: true }), 50);
    }
  };
}

// ---------------------------------------------------------------- Studio
let studioDraft = null;
let speaker = null;

export function stopStudio() { speaker?.stop(); }

export function viewStudio(query) {
  const drafts = store.get().drafts;
  const supported = speechSupported();
  if (query.get('draft')) studioDraft = drafts.find((d) => d.id === query.get('draft')) || studioDraft;

  return {
    title: 'Studio',
    html: `
    <section class="studiohead">
      <p class="kicker mono"><span class="onair-dot"></span> Echo Studio · runs on your device</p>
      <h1 class="display">Say a topic.<br /><span class="display__soft">Two hosts will talk it through.</span></h1>
      <form class="prompt" id="studioForm" autocomplete="off">
        <input id="topic" name="topic" type="text" maxlength="120" placeholder="e.g. How volcanoes work" aria-label="Episode topic" required />
        <button type="submit" class="btn btn--signal">${icon('sparkle', 18)}<span>Generate</span></button>
      </form>
      <div class="chips chips--suggest">${SUGGESTIONS.map((s) => `<button type="button" class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    </section>

    <section class="onair" id="onair" ${studioDraft ? '' : 'hidden'}></section>

    <section class="sec" id="drafts"></section>

    <p class="fineprint">Studio scripts are assembled on your device from structured templates and read aloud by your browser’s built-in voices. They’re great for sparking ideas and practising explanations; they are not a fact source.${supported ? '' : ' <b>Your browser doesn’t support speech synthesis, so scripts will be text-only.</b>'}</p>`,
    mount(root) {
      const form = $('#studioForm', root);
      const input = $('#topic', root);
      const onair = $('#onair', root);
      const draftsEl = $('#drafts', root);
      let voices = [];
      let pair = [null, null];

      const setLive = (i) => {
        $$('.prompter li', onair).forEach((li) => li.classList.toggle('is-live', Number(li.dataset.seg) === i));
        const seg = studioDraft?.segments[i];
        $$('.host', onair).forEach((h) => h.classList.toggle('is-speaking', seg && Number(h.dataset.host) === seg.voice));
        const live = $('.prompter li.is-live', onair);
        if (live) live.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      const setState = (st) => {
        onair.classList.toggle('is-live', st === 'playing');
        const b = $('#onairPlay', onair);
        if (b) { b.classList.toggle('is-playing', st === 'playing'); b.setAttribute('aria-label', st === 'playing' ? 'Pause' : 'Play'); }
        if (st === 'playing' && player.playing) player.pause();
      };
      speaker?.stop();
      speaker = supported ? createSpeaker({ onSegment: setLive, onState: setState }) : null;

      const renderDrafts = () => {
        const list = store.get().drafts;
        draftsEl.innerHTML = list.length ? `${sectionHead('Saved drafts', 'Your studio shelf')}
          <ul class="drafts">${list.map((d) => `<li class="draft" style="--c:${d.theme === 'general' ? 'var(--signal)' : bandById(d.theme)?.hue || 'var(--signal)'}">
            <button type="button" class="draft__open" data-action="studio-open" data-id="${esc(d.id)}"><span class="draft__title">${esc(d.title)}</span><span class="mono muted">${esc(d.themeLabel)} · ~${Math.round(d.seconds / 60)} min · ${new Date(d.createdAt).toLocaleDateString()}</span></button>
            <button type="button" class="ibtn" data-action="studio-delete" data-id="${esc(d.id)}" aria-label="Delete draft">${icon('trash', 18)}</button>
          </li>`).join('')}</ul>` : '';
      };

      const renderDraft = () => {
        if (!studioDraft) { onair.hidden = true; return; }
        const d = studioDraft;
        const saved = store.get().drafts.some((x) => x.id === d.id);
        const ref = d.ref ? findEpisode(d.ref) : null;
        onair.hidden = false;
        onair.style.setProperty('--c', d.theme === 'general' ? 'var(--signal)' : bandById(d.theme)?.hue || 'var(--signal)');
        onair.innerHTML = `
          <header class="onair__head">
            <p class="onair__light mono"><i></i> On air</p>
            <div><h2 class="onair__title">${esc(d.title)}</h2>
            <p class="mono muted">${esc(d.themeLabel)} · ~${Math.round(d.seconds / 60)} min${d.keywords.length ? ` · ${d.keywords.slice(0, 3).map((k) => `#${esc(k)}`).join(' ')}` : ''}</p></div>
          </header>
          <div class="hosts">${HOSTS.map((h, i) => `<div class="host" data-host="${i}"><span class="host__av" aria-hidden="true">${h.name[0]}<i></i><i></i></span><span><b>${h.name}</b><small class="mono">${h.role}</small></span></div>`).join('')}</div>
          <ol class="prompter">${d.segments.map((sg, i) => `<li data-seg="${i}" data-voice="${sg.voice}"><button type="button" data-action="studio-jump" data-seg="${i}"><b class="mono">${esc(sg.speaker)}</b><span>${esc(sg.text)}</span></button></li>`).join('')}</ol>
          ${ref ? `<a class="onair__ref" href="#/ep/${esc(ref.slug)}">${coverHtml(ref)}<span><small class="mono">Related on the dial · ${fmtFreq(ref.freq)} FM</small><b>${esc(ref.title)}</b></span>${icon('chevron', 18)}</a>` : ''}
          <div class="onair__ctrls">
            ${speaker ? `<button type="button" class="pbtn" id="onairPlay" data-action="studio-toggle" aria-label="Play">${icon('play', 20, 'i-play')}${icon('pause', 20, 'i-pause')}</button>
            <button type="button" class="ibtn ibtn--box" data-action="studio-stop" aria-label="Stop">${icon('stop', 18)}</button>
            <label class="select mono"><span class="sr">Speech speed</span><select id="studioRate"><option value="0.9">0.9×</option><option value="1" selected>1×</option><option value="1.15">1.15×</option><option value="1.3">1.3×</option></select></label>` : ''}
            <span class="spacer"></span>
            <button type="button" class="btn btn--ghost btn--sm" data-action="studio-save" ${saved ? 'disabled' : ''}>${icon(saved ? 'check' : 'download', 16)}<span>${saved ? 'Saved' : 'Save'}</span></button>
            <button type="button" class="ibtn ibtn--box" data-action="studio-copy" aria-label="Copy script" title="Copy script">${icon('copy', 18)}</button>
            <button type="button" class="ibtn ibtn--box" data-action="studio-download" aria-label="Download script as text" title="Download .txt">${icon('upload', 18)}</button>
          </div>
          ${speaker ? `<details class="voices"><summary class="mono">Voices</summary><div class="voices__grid">${HOSTS.map((h, i) => `<label><span>${h.name}</span><select data-voice-for="${i}"></select></label>`).join('')}</div></details>` : ''}`;
        fillVoices();
        const rateSel = $('#studioRate', onair);
        rateSel?.addEventListener('change', () => speaker.setRate(Number(rateSel.value)));
      };

      const fillVoices = () => {
        $$('[data-voice-for]', onair).forEach((sel) => {
          const i = Number(sel.dataset.voiceFor);
          sel.innerHTML = voices.map((v) => `<option value="${esc(v.name)}" ${pair[i]?.name === v.name ? 'selected' : ''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('') || '<option>Default voice</option>';
          sel.onchange = () => { pair[i] = voices.find((v) => v.name === sel.value) || null; speaker?.setVoices(pair); };
        });
      };

      if (speaker) voicesReady().then((v) => {
        const en = v.filter((x) => /^en/i.test(x.lang));
        voices = (en.length ? en : v);
        pair = defaultVoicePair(v);
        speaker.setVoices(pair);
        fillVoices();
      });

      const generate = (topic) => {
        const tTopic = topic.trim();
        if (tTopic.length < 2) { input.focus(); return; }
        speaker?.stop();
        studioDraft = buildDraft(tTopic);
        renderDraft();
        speaker?.load(studioDraft);
        onair.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (speaker) setTimeout(() => speaker.play(0), 350);
      };

      form.addEventListener('submit', (e) => { e.preventDefault(); generate(input.value); });
      root.addEventListener('click', (e) => {
        const sug = e.target.closest('[data-suggest]');
        if (sug) { input.value = sug.dataset.suggest; generate(input.value); return; }
        const a = e.target.closest('[data-action^="studio-"]');
        if (!a) return;
        const act = a.dataset.action;
        if (act === 'studio-toggle') speaker?.toggle();
        else if (act === 'studio-stop') speaker.stop();
        else if (act === 'studio-jump') speaker?.jump(Number(a.dataset.seg));
        else if (act === 'studio-save') {
          store.update((s) => { s.drafts = [studioDraft, ...s.drafts.filter((d) => d.id !== studioDraft.id)].slice(0, 30); }, 'drafts');
          renderDraft(); renderDrafts(); toast('Draft saved to your studio shelf');
        } else if (act === 'studio-copy') {
          navigator.clipboard?.writeText(draftToText(studioDraft)).then(() => toast('Script copied'), () => toast('Copy failed — try Download instead'));
        } else if (act === 'studio-download') {
          const blob = new Blob([draftToText(studioDraft)], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const link = Object.assign(document.createElement('a'), { href: url, download: `${studioDraft.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'echo-studio'}.txt` });
          document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else if (act === 'studio-open') {
          speaker?.stop();
          studioDraft = store.get().drafts.find((d) => d.id === a.dataset.id) || null;
          renderDraft(); speaker?.load(studioDraft);
          onair.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (act === 'studio-delete') {
          const id = a.dataset.id;
          const removed = store.get().drafts.find((d) => d.id === id);
          store.update((s) => { s.drafts = s.drafts.filter((d) => d.id !== id); }, 'drafts');
          renderDrafts(); if (studioDraft?.id === id) renderDraft();
          toast('Draft deleted', { action: 'Undo', onAction: () => { store.update((s) => { s.drafts = [removed, ...s.drafts]; }, 'drafts'); renderDrafts(); renderDraft(); } });
        }
      });

      renderDraft();
      if (studioDraft) speaker?.load(studioDraft);
      renderDrafts();
      return () => speaker?.stop();
    }
  };
}

// ---------------------------------------------------------------- Library
const TABS = [
  ['kept', 'Kept'],
  ['history', 'History'],
  ['offline', 'Offline'],
  ['tapes', 'Your tapes']
];

export function viewLibrary(query) {
  const tab = TABS.some(([k]) => k === query.get('tab')) ? query.get('tab') : 'kept';
  const s = store.get();
  const stats = getStats();
  const top = stats.topBand ? bandById(stats.topBand) : null;

  let list = [];
  let empty = '';
  if (tab === 'kept') {
    list = s.kept.map(resolveEp).filter(Boolean);
    empty = emptyState('Nothing kept yet', 'Tap the heart on any station to keep it here for later.', '<a class="btn btn--ghost" href="#/">Tune the dial</a>');
  } else if (tab === 'history') {
    list = s.history.map(resolveEp).filter(Boolean);
    empty = emptyState('No history yet', 'Stations you play will show up here, newest first.', '<a class="btn btn--ghost" href="#/">Start listening</a>');
  } else if (tab === 'offline') {
    list = ALL_STATIONS.filter((e) => isSaved(e.audio));
    empty = emptyState('No downloads', 'Save stations for offline and they’ll play on a plane, in a tunnel, anywhere.', '');
  } else if (tab === 'tapes') {
    list = getTapes();
    empty = emptyState('No tapes yet', 'Add your own MP3s — recordings, lectures, voice notes. They stay on this device only.', '');
  }

  return {
    title: 'Library',
    html: `
    <section class="libhead">
      <p class="kicker mono">Library</p>
      <h1 class="display">Your echo.</h1>
    </section>
    <section class="stats">
      <div class="stat"><b>${esc(fmtHours(stats.totalSeconds))}</b><span>listened</span></div>
      <div class="stat"><b>${stats.streak}</b><span>day streak</span></div>
      <div class="stat"><b>${stats.finished}</b><span>finished</span></div>
      <div class="stat" style="--c:${top ? top.hue : 'var(--ink-3)'}"><b>${top ? esc(top.name) : '—'}</b><span>top band</span></div>
      <div class="stats__week"><p class="kicker mono">Last 7 days · ${esc(fmtHours(stats.week.reduce((a, d) => a + d.seconds, 0)))}</p><div class="stats__bars" aria-label="Listening over the last seven days">${weekBars(stats.week)}</div></div>
    </section>
    <nav class="tabs" aria-label="Library sections">
      ${TABS.map(([k, label]) => `<a href="#/library?tab=${k}" class="tab ${k === tab ? 'is-on' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
    ${tab === 'tapes' ? `<div class="tapebar"><p class="muted">Tapes are stored in this browser only and never uploaded anywhere.</p><button type="button" class="btn btn--signal btn--sm" data-action="upload">${icon('upload', 16)}<span>Add a tape</span></button></div>` : ''}
    ${tab === 'offline' && list.length ? `<div class="tapebar"><p class="muted">${list.length} station${list.length === 1 ? '' : 's'} saved on this device.</p><button type="button" class="btn btn--ghost btn--sm" data-action="clear-offline">Remove all</button></div>` : ''}
    <section class="sec">${list.length ? `<ol class="rows">${list.map((e) => row(e, { actions: e.isTape ? `<button type="button" class="ibtn" data-action="delete-tape" data-slug="${esc(e.slug)}" aria-label="Delete tape">${icon('trash', 18)}</button>` : offlineBtn(e) })).join('')}</ol>` : empty}</section>
    ${tab === 'history' && list.length ? `<p class="center"><button type="button" class="btn btn--ghost btn--sm" data-action="clear-history">Clear history</button></p>` : ''}`
  };
}

// ---------------------------------------------------------------- About
export function viewAbout() {
  const hues = BANDS.map((b) => b.hue);
  return {
    title: 'About',
    html: `
    <section class="about">
      <p class="kicker mono">About · ${fmtFreq(STATION_ID.freq)} FM</p>
      <h1 class="display">A radio for<br /><span class="display__soft">curious minds.</span></h1>
      <p class="lede">EchoHub turns learning into tuning. Every episode is a station on an FM-style dial — short, focused explainers on technology, science, geography and history that you can finish on a walk, a bus ride or between classes.</p>
    </section>
    <section class="sec sec--split">
      <article class="daily" style="--c:var(--signal)">
        <div class="daily__art">${coverHtml(STATION_ID)}</div>
        <div class="daily__body">
          <p class="kicker mono">Station ID · ${fmtFreq(STATION_ID.freq)} FM</p>
          <h2 class="daily__title">${esc(STATION_ID.title)}</h2>
          <p class="daily__desc">${esc(STATION_ID.description)}</p>
          <div class="daily__actions">${playBtn(STATION_ID)}<span class="mono daily__len">${esc(fmtLength(STATION_ID.seconds))}</span></div>
        </div>
      </article>
      <div class="principles">
        <h2 class="sec__title">How it works</h2>
        <ul>
          <li><b>Tune, don’t scroll.</b> Drag the dial and let curiosity pick. Between stations you’ll hear a little static.</li>
          <li><b>Keep the dial playing.</b> When an episode ends, EchoHub tunes to the next station you haven’t heard.</li>
          <li><b>Works offline.</b> Install it like an app and save stations for when there’s no signal.</li>
          <li><b>Private by design.</b> No account, no tracking, no ads. Everything you do stays on your device.</li>
        </ul>
      </div>
    </section>
    <section class="sec">
      ${sectionHead('The crew', 'Made by AINOVA · Group 6')}
      <ul class="team">${TEAM.map((m, i) => `<li class="member" style="--c:${hues[i % hues.length]}"><span class="member__av" aria-hidden="true">${esc(m.name[0])}</span><div><h3>${esc(m.name)}</h3><p class="mono">${esc(m.role)}</p><p class="member__bio">${esc(m.bio)}</p></div></li>`).join('')}</ul>
    </section>
    <section class="sec colophon">
      <p class="mono muted">EchoHub began as a school AI club project and grew into a full listening app. Built with plain HTML, CSS and JavaScript — no frameworks, no trackers — and hosted on GitHub Pages.</p>
      <p class="mono muted"><a class="link" href="https://github.com/nikhildoesntcommit/EchoHub" target="_blank" rel="noopener">Source on GitHub ${icon('external', 14)}</a> · <button type="button" class="link" data-action="shortcuts">Keyboard shortcuts</button> · <button type="button" class="link" data-action="settings">Settings</button></p>
    </section>`
  };
}

export function viewNotFound() {
  return {
    title: 'Lost signal',
    html: `<section class="sec">${emptyState('Lost signal', 'That frequency isn’t broadcasting. It may have moved, or the link is mistyped.', '<a class="btn btn--signal" href="#/">Back to the dial</a>')}</section>`
  };
}
