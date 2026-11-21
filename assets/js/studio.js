// Echo Studio — an on-device script engine. Type a topic and two hosts (Juno and Kit)
// talk it through using the browser's built-in voices. No servers, no accounts.

import { EPISODES } from './catalog.js';

const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const lower = (s) => clean(s).toLowerCase();
const words = (s) => lower(s).match(/[a-z0-9']+/g) || [];
const lowerFirst = (s) => { const v = clean(s); return v ? v[0].toLowerCase() + v.slice(1) : ''; };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const picker = (seed) => (list, salt = 0) => list[hash(`${seed}:${salt}`) % list.length];

const STOP = new Set('the and or but for with into from that this these those about your you are was were is be been being a an to of in on at as by it its we they them their our my what why how when where who which could would should can do does did just really very more most much many work works working make makes made happen happens thing things explained explain story stories history behind'.split(' '));
const keywordsOf = (t) => [...new Set(words(t).filter((w) => (w.length > 2 || w === 'ai') && !STOP.has(w)))].slice(0, 5);

const BLUEPRINTS = {
  general: {
    label: 'General',
    lens: ['the structure behind the topic', 'the logic that makes the topic work', 'the bigger idea underneath the surface'],
    everyday: ['normal conversations, schoolwork, and the way people make sense of unfamiliar ideas', 'everyday decisions, practical examples, and simple comparisons that make the idea feel real', 'the situations where people need to explain, compare, or understand something clearly'],
    misconception: ['People often assume the topic is either too simple to matter or too complex to explain clearly, but usually the real challenge is just organising the idea properly.', 'A common mistake is treating the topic like a single fact instead of a system of connected parts.', 'It can sound abstract at first, but once the moving parts are named, it becomes much easier to follow.'],
    mechanics: ['the definition, the context, and the result', 'what it is, how it behaves, and why people care about it', 'the core idea, the example, and the takeaway'],
    impact: ['how people understand the world, make decisions, and explain things to each other', 'the way information gets interpreted and turned into action', 'why clear understanding matters before people form opinions or make choices'],
    closing: ['The useful takeaway is that understanding the structure of the topic is often more important than memorising a one-line definition.', 'Once the topic is broken into clear steps, it stops feeling vague and starts feeling useful.', 'That is usually the moment when the topic shifts from sounding difficult to sounding interesting.']
  },
  technology: {
    label: 'Technology',
    lens: ['systems, inputs, and outputs', 'the connection between software, devices, and people', 'how information turns into action'],
    everyday: ['phones, apps, websites, and the invisible systems people depend on every day', 'the tools people use constantly without always thinking about what is happening underneath', 'search, messaging, streaming, and the small automated decisions built into modern devices'],
    misconception: ['A lot of people talk about technology like it is magic, when most of it is a chain of understandable steps and design choices.', 'It is easy to focus only on shiny gadgets, but the deeper story is about systems and the information flowing through them.', 'People often think the topic matters only to experts, even though it shapes basic daily habits for almost everyone.'],
    mechanics: ['the input, the process, and the output', 'the data, the rules, and the result', 'what the system receives, how it handles it, and what happens next'],
    impact: ['speed, convenience, automation, and the tradeoffs built into digital life', 'how people communicate, find information, and trust the tools around them', 'privacy, reliability, and the way small design decisions affect millions of users'],
    closing: ['That is why the topic matters: it is not just a buzzword, it is part of how modern life actually runs.', 'The clearer you see the system, the less mysterious the technology feels.', 'Once the process is visible, the topic becomes much easier to evaluate instead of just admire.']
  },
  science: {
    label: 'Science',
    lens: ['observation, explanation, and evidence', 'patterns in the natural world', 'how causes lead to visible effects'],
    everyday: ['health, weather, motion, space, and the hidden processes that affect daily life', 'the body, the sky, and the ordinary questions people ask when they notice patterns', 'real-world examples where a scientific explanation makes confusing things easier to understand'],
    misconception: ['People sometimes treat science like memorising facts, but the real skill is asking what causes something and how we know the answer.', 'A scientific topic can sound intimidating until you connect it to evidence, observation, and one concrete example.', 'The topic usually feels harder than it is because people hear the vocabulary before they hear the logic.'],
    mechanics: ['the observation, the explanation, and the real-world effect', 'what is happening, why it happens, and what that means in practice', 'the cause, the mechanism, and the outcome'],
    impact: ['health, safety, prediction, and the way people make sense of the world around them', 'how we interpret evidence and apply it to real situations', 'why scientific understanding changes what people believe and how they act'],
    closing: ['That is the strength of science-focused topics: once the cause-and-effect chain is clear, the whole idea becomes more intuitive.', 'The big win is not just learning the fact, but learning the reasoning behind it.', 'When the process makes sense, the topic stops feeling like a mystery and starts feeling logical.']
  },
  geography: {
    label: 'Geography',
    lens: ['place, movement, and environment', 'how locations shape human activity', 'patterns across land, climate, and resources'],
    everyday: ['weather, cities, rivers, landforms, and the practical ways people respond to place', 'maps, travel, climate, and the visible patterns people notice across different regions', 'transport, resources, settlements, and why some places behave differently from others'],
    misconception: ['A lot of people reduce geography to memorising locations, but the real topic is how places connect and why those patterns matter.', 'It can look like a list of names until you start asking what the land, water, and climate are doing.', 'The topic gets more interesting once you stop thinking of it as a map quiz and start treating it like a living system.'],
    mechanics: ['the physical setting, the human response, and the long-term effect', 'the location, the process, and the pattern it creates', 'the environment, the movement through it, and the result people experience'],
    impact: ['how people build, travel, farm, plan, and respond to natural conditions', 'why resources, risks, and opportunities are distributed unevenly across places', 'how climate and landscape shape everyday life and major decisions'],
    closing: ['That is what makes geography powerful: it explains why the world is connected instead of looking like isolated points on a map.', 'Once you see the pattern, the topic becomes a story about relationships between places.', 'The interesting part is not just where something is, but what that location changes.']
  },
  history: {
    label: 'History',
    lens: ['causes, turning points, and consequences', 'how decisions shape later events', 'what the present inherits from the past'],
    everyday: ['monuments, borders, traditions, and the stories societies keep carrying forward', 'how people remember events and how those events still influence modern life', 'the moments when one decision changes a larger chain of events'],
    misconception: ['People often flatten history into dates and names, but the real value is understanding why events happened and what followed.', 'The topic feels much richer once you start asking about motives, pressure, and consequence instead of just sequence.', 'History is usually more understandable when it is treated like a chain of choices rather than a list to memorise.'],
    mechanics: ['the background, the turning point, and the consequence', 'the context, the decision, and the long-term result', 'the pressures building up, the event itself, and the changes that followed'],
    impact: ['how people interpret the present and understand why societies look the way they do', 'why ideas, borders, institutions, and identities still carry traces of earlier events', 'the lessons people draw when they look at success, failure, conflict, and change over time'],
    closing: ['That is why history matters: it explains the present by showing what had to happen before it.', 'Once the cause-and-effect chain is visible, the topic stops feeling distant and starts feeling relevant.', 'The real lesson is usually not just what happened, but why the outcome still matters now.']
  }
};

function detectTheme(topic, ref) {
  if (ref) return ref.band;
  const v = lower(topic);
  if (/\b(ai|technology|tech|internet|computers?|software|apps?|phones?|smartphones?|robots?|devices?|data|coding|code|digital|networks?|crypto|blockchain|chips?)\b/.test(v)) return 'technology';
  if (/\b(science|space|planets?|stars?|galax(y|ies)|universe|black holes?|biology|physics|chemistry|vaccines?|body|brain|dreams?|lab|experiments?|dna|cells?|atoms?|evolution)\b/.test(v)) return 'science';
  if (/\b(geography|countr(y|ies)|cit(y|ies)|deserts?|oceans?|earthquakes?|climate|weather|mountains?|rivers?|maps?|landscapes?|terrain|dams?|volcano(es)?|glaciers?|forests?)\b/.test(v)) return 'geography';
  if (/\b(history|historic|ancient|rome|roman|empires?|wars?|revolutions?|kings?|queens?|civili[sz]ations?|taj mahal|medieval|dynast(y|ies)|museum|pharaohs?|egypt|silk road|trade routes?|printing press|renaissance|vikings?|samurai)\b/.test(v)) return 'history';
  return 'general';
}

function findReference(topic, keys) {
  const t = lower(topic);
  const scored = EPISODES.map((e) => {
    const title = lower(e.title); const desc = lower(e.description); const tags = e.tags.map(lower);
    let s = 0;
    if (title.includes(t)) s += 20;
    if (desc.includes(t)) s += 10;
    keys.forEach((k) => {
      if (title.includes(k)) s += 10;
      if (desc.includes(k)) s += 6;
      if (e.band.includes(k)) s += 4;
      if (tags.some((g) => g.includes(k) || k.includes(g))) s += 8;
    });
    return { e, s };
  }).sort((a, b) => b.s - a.s);
  return scored[0]?.s >= 12 ? scored[0].e : null;
}

export const HOSTS = [
  { name: 'Juno', role: 'Host' },
  { name: 'Kit', role: 'Co-host' }
];

export const estimateSeconds = (segments) => Math.max(60, Math.round((segments.reduce((n, sg) => n + words(sg.text).length, 0) / 150) * 60));

// Draft metadata shared by both writers: title, band theme, keywords and the
// closest matching station on the dial. Segments are filled in by the writer.
export function draftMeta(rawTopic, engine = 'template') {
  const raw = clean(rawTopic);
  const keys = keywordsOf(raw);
  const ref = findReference(raw, keys);
  const themeId = detectTheme(raw, ref);
  return {
    id: `draft-${Date.now()}`,
    topic: raw,
    title: raw.replace(/^\w/, (c) => c.toUpperCase()),
    theme: themeId,
    themeLabel: (BLUEPRINTS[themeId] || BLUEPRINTS.general).label,
    seconds: 60,
    keywords: keys,
    ref: ref?.slug || null,
    engine,
    segments: [],
    createdAt: Date.now()
  };
}

export function buildDraft(rawTopic) {
  const raw = clean(rawTopic);
  // Lower-case the first letter for mid-sentence use, unless it looks like an acronym or name ("AI", "GPS").
  const topic = /^[A-Z][a-z]/.test(raw) && !/^(I|I'm)\b/.test(raw) && /^(How|Why|What|The|A|An|When|Where|Who|Is|Are|Can|Do|Does)\b/.test(raw) ? raw[0].toLowerCase() + raw.slice(1) : raw;
  const pick = picker(lower(raw));
  const keys = keywordsOf(raw);
  const ref = findReference(raw, keys);
  const themeId = detectTheme(raw, ref);
  const bp = BLUEPRINTS[themeId] || BLUEPRINTS.general;

  const f1 = keys[0] || topic;
  const f2 = keys[1] || (bp.label === 'General' ? 'the context around it' : bp.label.toLowerCase());
  const f3 = keys[2] || pick(['the people involved', 'the evidence', 'the everyday examples'], 12);
  const mechanics = pick(bp.mechanics, 1);
  const everyday = pick(bp.everyday, 2);
  const misconception = pick(bp.misconception, 3);
  const impact = pick(bp.impact, 4);
  const closing = pick(bp.closing, 5);
  const lens = pick(bp.lens, 6);

  const refLine = ref
    ? `A useful anchor here is the EchoHub episode "${ref.title}", which already frames it this way: ${lowerFirst(ref.description)}`
    : 'Even without a matching episode on the dial, the topic gets clearer the moment you connect the definition to one real situation.';
  const exampleLine = ref
    ? `That gives us a practical lens: focus on ${ref.tags.slice(0, 2).join(' and ')}, because that is where the idea becomes concrete.`
    : `A simple way to picture it is to imagine ${f1} changing what people notice, decide, or build in a real setting.`;

  const segments = [
    [0, `Welcome to Echo Studio. I'm Juno, and today we are unpacking ${topic}. The best way in is to treat it like a real idea with moving parts, not just a headline.`],
    [1, `And I'm Kit. ${topic} is much easier to follow when you break it into ${mechanics}. That simple structure gives us a path through it.`],
    [0, `${pick([
      'The smartest first question is not "can I memorise this?" but "what is changing, and why does that change matter?"',
      'A better starting point is to ask what problem the topic solves, what forces shape it, and what result follows from it.',
      'The quickest route in is to find the main pattern first, and leave the details for second.'
    ], 8)} Here, the lens is really ${lens}, which is why it keeps showing up in ${everyday}.`],
    [1, `${misconception} Once you stop treating it like a vague term, you can see what ${f1}, ${f2}, and ${f3} each contribute to the bigger picture.`],
    [0, `${refLine} ${exampleLine}`],
    [1, `So why does any of this matter? Because it shapes ${impact}, and that changes how people read situations and respond to them.`],
    [0, `${pick([
      `That is where ${topic} starts to feel bigger than one definition, because it connects to ${lens} and to ${everyday}.`,
      `Once those pieces line up, ${topic} stops sounding isolated and starts to look like part of a wider system.`,
      'That wider context matters, because a topic almost never lives alone. It connects outward to other ideas, choices, and consequences.'
    ], 9)} That is usually the point where it becomes interesting instead of intimidating.`],
    [1, `${pick([
      `So the core picture is this: ${topic} makes the most sense when you track ${mechanics} instead of only memorising labels.`,
      `The short version: ${topic} gets easier once you move from surface description to underlying structure.`,
      'In plain language, it matters because it shows you how a process works instead of just giving it a name.'
    ], 10)} ${closing}`],
    [0, pick(['That is our take for today. Thanks for tuning in to Echo Studio.', 'That is the quick take. Stay curious, and we will catch you on the next frequency.', 'That is all for this one. Keep the dial moving.'], 11)]
  ].map(([voice, text]) => ({ voice, speaker: HOSTS[voice].name, text }));

  return { ...draftMeta(raw), segments, seconds: estimateSeconds(segments) };
}

export const SUGGESTIONS = ['How volcanoes work', 'The history of the printing press', 'Why the sky is blue', 'How GPS knows where you are', 'The Silk Road', 'What makes a rainforest'];

// ---- Speech ------------------------------------------------------------
export const speechSupported = () => 'speechSynthesis' in window;

export function voicesReady() {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve([]);
    const v = speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    const t = setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
    speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); resolve(speechSynthesis.getVoices()); }, { once: true });
  });
}

const FEM = /female|zira|samantha|victoria|karen|susan|tessa|allison|serena|eva|lisa|emma|nicky|jenny|aria|sonia|libby|moira|fiona|veena|ava/;
const MALE = /male|daniel|david|fred|tom|mark|george|alex|james|matthew|raj|arjun|ravi|guy|ryan|oliver|rishi|aaron/;

export function defaultVoicePair(voices) {
  const en = voices.filter((v) => lower(v.lang).startsWith('en'));
  const pool = en.length ? en : voices;
  if (!pool.length) return [null, null];
  const score = (v, want) => {
    const n = lower(v.name); let s = 0;
    if (/^en[-_](us|gb|in|au)/.test(lower(v.lang))) s += 10;
    if (v.localService) s += 5;
    if (/natural|neural|premium|enhanced/.test(n)) s += 8;
    if ((want === 'f' ? FEM : MALE).test(n)) s += 25;
    return s;
  };
  const a = [...pool].sort((x, y) => score(y, 'f') - score(x, 'f'))[0];
  const b = [...pool].filter((v) => v.name !== a.name).sort((x, y) => score(y, 'm') - score(x, 'm'))[0] || a;
  return [a, b];
}

// Speaks one segment at a time so the UI can follow along and pause/resume
// reliably (Chrome's native pause() is unreliable for long queues).
// While a script is still being written (draft.writing), the speaker waits at
// the end of the queue and carries on as soon as the next line arrives.
export function createSpeaker({ onSegment, onState }) {
  let segs = [];
  let draft = null;
  let idx = 0;
  let playing = false;
  let waiting = false;
  let voices = [null, null];
  let rate = 1;
  let token = 0;

  function speakFrom(i) {
    const my = ++token;
    speechSynthesis.cancel();
    idx = i;
    waiting = false;
    if (idx >= segs.length && draft?.writing) { waiting = true; onSegment?.(idx); return; }
    if (idx >= segs.length) { playing = false; onSegment?.(-1); onState?.('ended'); return; }
    const seg = segs[idx];
    const u = new SpeechSynthesisUtterance(seg.text);
    const v = voices[seg.voice];
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = rate * (seg.voice === 0 ? 0.98 : 1.02);
    u.pitch = seg.voice === 0 ? 1.02 : 0.95;
    u.onend = () => { if (my === token && playing) speakFrom(idx + 1); };
    u.onerror = (e) => { if (my === token && e.error !== 'interrupted' && e.error !== 'canceled') { playing = false; onState?.('error'); } };
    onSegment?.(idx);
    speechSynthesis.speak(u);
  }

  return {
    get playing() { return playing; },
    get index() { return idx; },
    get rate() { return rate; },
    load(d) { this.stop(); draft = d; segs = d.segments; idx = 0; },
    // Call when the draft gains a segment or finishes writing.
    nudge() { if (playing && waiting) speakFrom(idx); },
    setVoices(pair) { voices = pair; },
    setRate(r) { rate = r; },
    play(from = idx) { if (!segs.length) return; playing = true; onState?.('playing'); speakFrom(from >= segs.length ? 0 : from); },
    pause() { playing = false; waiting = false; token++; speechSynthesis.cancel(); onState?.('paused'); },
    toggle() { return playing ? this.pause() : this.play(); },
    stop() { playing = false; waiting = false; token++; if (speechSupported()) speechSynthesis.cancel(); idx = 0; onSegment?.(-1); onState?.('stopped'); },
    jump(i) { playing = true; onState?.('playing'); speakFrom(i); }
  };
}

export function draftToText(d) {
  return `${d.title}\nEcho Studio · ${d.themeLabel} · ~${Math.round(d.seconds / 60)} min\n\n${d.segments.map((s) => `${s.speaker.toUpperCase()}: ${s.text}`).join('\n\n')}\n`;
}
