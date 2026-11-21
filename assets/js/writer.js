// Echo Studio AI writer — main-thread side. Owns the model worker, tracks its
// state for the UI, and turns streamed model text into two-host script segments.

import { HOSTS } from './studio.js';

export const MODEL = {
  id: 'onnx-community/gemma-3-1b-it-ONNX',
  name: 'Gemma 3 1B',
  dtypes: { fp16: 'q4f16', fp32: 'q4' },
  sizeMB: 760
};

const MODEL_CACHE = 'transformers-cache';

export const aiSupported = () => typeof Worker !== 'undefined' && 'caches' in window && 'gpu' in navigator;

// Has the model already been downloaded on this device?
export async function modelCached() {
  try {
    if (!(await caches.has(MODEL_CACHE))) return false;
    const cache = await caches.open(MODEL_CACHE);
    const keys = await cache.keys();
    return keys.some((r) => r.url.includes(MODEL.id) && /\.onnx_data$/.test(r.url));
  } catch { return false; }
}

export async function deleteModel() {
  writer.unload();
  try { await caches.delete(MODEL_CACHE); } catch { /* ignore */ }
  try { await caches.delete('echohub-ai-v1'); } catch { /* ignore */ }
}

const listeners = new Set();
let worker = null;
let pending = null; // { onToken, resolve, reject }

const state = { status: 'off', loaded: 0, total: 0, device: null, note: '', error: '' };

function emit() { listeners.forEach((fn) => fn({ ...state })); }
function set(patch) { Object.assign(state, patch); emit(); }

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./writer-worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    if (data.type === 'progress') set({ status: 'loading', loaded: data.loaded, total: data.total });
    else if (data.type === 'status') set({ note: data.text });
    else if (data.type === 'ready') set({ status: 'ready', device: data.device, note: '', error: '' });
    else if (data.type === 'token') pending?.onToken(data.text);
    else if (data.type === 'done') { const p = pending; pending = null; set({ status: 'ready' }); p?.resolve(data.text); }
    else if (data.type === 'error') {
      if (data.raw) console.warn('[EchoHub AI writer]', data.raw);
      const p = pending; pending = null;
      if (p) { set({ status: state.device ? 'ready' : 'error', error: data.message }); p.reject(new Error(data.message)); }
      else set({ status: 'error', error: data.message, note: '' });
    }
  });
  worker.addEventListener('error', (e) => {
    set({ status: 'error', error: e.message || 'The AI writer could not start in this browser.' });
    pending?.reject(new Error(state.error)); pending = null;
  });
  return worker;
}

export const writer = {
  get state() { return { ...state }; },
  subscribe(fn) { listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); },
  load() {
    if (state.status === 'ready' || state.status === 'loading') return;
    set({ status: 'loading', loaded: 0, total: 0, error: '', note: 'Starting' });
    ensureWorker().postMessage({ type: 'load', model: MODEL });
  },
  unload() {
    worker?.terminate(); worker = null;
    pending?.reject(new Error('stopped')); pending = null;
    set({ status: 'off', loaded: 0, total: 0, device: null, note: '', error: '' });
  },
  stop() { worker?.postMessage({ type: 'stop' }); },
  get busy() { return state.status === 'writing'; },
  generate(messages, options, onToken) {
    if (state.status !== 'ready') return Promise.reject(new Error('The AI writer is not ready yet.'));
    set({ status: 'writing' });
    return new Promise((resolve, reject) => {
      pending = { onToken, resolve, reject };
      worker.postMessage({ type: 'generate', model: MODEL, messages, options });
    });
  }
};

// ---------------------------------------------------------------- Prompting

const SYSTEM = `You write scripts for Echo Studio, a short podcast where two friends explain one topic.
The hosts are Juno (curious, asks the questions a listener would ask) and Kit (explains clearly, with concrete everyday examples).

Rules:
- Write exactly 10 lines, alternating JUNO and KIT, starting with JUNO.
- Juno only asks short questions and reacts. Kit gives the explanations, with an everyday example. Juno never answers her own question.
- Every line begins with "JUNO:" or "KIT:" followed by one to three spoken sentences.
- Explain how and why, using well-known facts. Do not invent statistics, percentages, dates or quotes.
- No narration, stage directions, sound effects, headings, emphasis or markdown.
- Line 1: Juno welcomes listeners to Echo Studio and introduces the topic. Line 10: Juno thanks Kit and signs off.`;

// Hard limit so a chatty model can't run on forever.
export const MAX_TURNS = 11;

const SIGN_OFF = /\b(thank|thanks|bye|goodbye|until next|see you|that['’]?s all|that['’]?s it for|for listening|for tuning in|catch you)\b/i;
const OUTROS = [
  'That’s all for today on Echo Studio. Thanks, Kit, and thanks for listening!',
  'And that’s our episode. Thanks for the explanations, Kit, and thank you for tuning in to Echo Studio.',
  'That’s it for this one. Stay curious, and we’ll catch you on the next frequency of Echo Studio.'
];

// Makes sure every AI script ends with Juno signing off, whatever the model did.
// `spokenUpTo` protects a line that is already being read aloud from removal.
export function finishScript(segs, spokenUpTo = -1) {
  const last = segs.at(-1);
  if (!last) return segs;
  if (last.voice === 0 && SIGN_OFF.test(last.text)) return segs;
  if (last.voice === 1 && SIGN_OFF.test(last.text) && segs.length >= 8) return segs;
  if (last.voice === 0 && segs.length - 1 > spokenUpTo) segs.pop(); // an unanswered question is a strange ending
  const text = OUTROS[Math.floor(Math.random() * OUTROS.length)];
  segs.push({ voice: 0, speaker: HOSTS[0].name, text });
  return segs;
}

export function buildMessages(topic, ref) {
  const anchor = ref ? `\n\nFor context, the EchoHub station "${ref.title}" describes a related idea: ${ref.description}` : '';
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Write the episode about: ${topic}${anchor}` }
  ];
}

export const GEN_OPTIONS = { max_new_tokens: 700, do_sample: true, temperature: 0.5, top_p: 0.9, repetition_penalty: 1.05 };

const SPEAKER = /^[\s>*_#-]*\**\s*(juno|kit)\s*\**\s*[:：]\s*\**\s*/i;
const STAGE = /\*\s*(?:laughs?|laughing|chuckles?|giggles?|pauses?|sighs?|smiles?|grins?|nods?|beat|music[^*]*|sound[^*]*|[^*]*\b(?:fades?|plays?|effects?)\b[^*]*)\s*\*/gi;
const tidy = (s) => s
  .replace(STAGE, ' ')                                  // *laughs*, *music fades*
  .replace(/\[[^\]]{1,60}\]/g, ' ')                     // [music]
  .replace(/\((?:laughs?|chuckles?|pauses?|sighs?|music|sound[^)]*)\)/gi, ' ')
  .replace(/\*\*|__|\*|(?<=\s|^)_|_(?=\s|$)/g, '')       // keep emphasised words, drop the markers
  .replace(/\bJ(?:o|ou|uu)no\b/g, 'Juno')                 // small models sometimes misspell the hosts
  .replace(/\bJUNO\b/g, 'Juno').replace(/\bKIT\b/g, 'Kit')
  .replace(/\s+([,.!?;:])/g, '$1')
  .replace(/\s+/g, ' ')
  .trim();

const complete = (t) => /[.!?…"”’)]$/.test(t);

// Incrementally parses streamed text into { voice, speaker, text } segments.
// Each labelled line becomes one turn as soon as it ends; anything without a
// speaker label (titles, preambles, notes) is dropped.
export function createScriptParser(onSegment) {
  let buf = '';
  const segs = [];
  const line = (raw) => {
    const l = raw.trim();
    const m = SPEAKER.exec(l);
    if (!m) return;
    const text = tidy(l.slice(m[0].length));
    if (text.length < 2) return;
    // The hosts always alternate; if the model labels two lines in a row for the
    // same host, trust the turn order over the label.
    const voice = segs.length ? 1 - segs.at(-1).voice : 0;
    const seg = { voice, speaker: HOSTS[voice].name, text };
    segs.push(seg);
    onSegment?.(seg, segs.length - 1);
  };
  return {
    push(chunk) {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
    },
    // The turn still being written, for a live typing effect.
    get partial() {
      const m = SPEAKER.exec(buf.trim());
      return m ? { voice: segs.length ? 1 - segs.at(-1).voice : 0, text: tidy(buf.trim().slice(m[0].length)) } : null;
    },
    // The final line may have been cut off by the token limit; keep it only if it ends cleanly.
    end() {
      const m = SPEAKER.exec(buf.trim());
      if (m && complete(tidy(buf.trim().slice(m[0].length)))) line(buf);
      buf = '';
      return segs;
    },
    get segments() { return segs; }
  };
}
