/* EchoHub service worker — offline shell, cached covers, and saved episodes
   served with byte-range support so seeking works with no connection. */

const VERSION = '2.0.0';
const SHELL = `echohub-shell-${VERSION}`;
const FONTS = 'echohub-fonts-v1';
const AUDIO = 'echohub-audio-v1'; // managed by the page (offline.js); never purged on update

const COVERS = [
  'about_us', 'bhakra_nangal_dam', 'black_holes_explained', 'causes_of_world_war_i',
  'how_the_internet_moves_data', 'how_vaccines_protect_us', 'smartphones_of_the_future',
  'stories_behind_the_taj_mahal', 'the_rise_of_ancient_rome', 'understanding_earthquakes',
  'what_is_ai_really', 'why_deserts_exist', 'why_we_dream'
].map((c) => `assets/img/covers/${c}.webp`);

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/css/app.css',
  'assets/js/main.js',
  'assets/js/catalog.js',
  'assets/js/store.js',
  'assets/js/player.js',
  'assets/js/tuner.js',
  'assets/js/studio.js',
  'assets/js/views.js',
  'assets/js/components.js',
  'assets/js/nowplaying.js',
  'assets/js/sheets.js',
  'assets/js/offline.js',
  'assets/js/uploads.js',
  'assets/js/ui.js',
  'assets/icons/favicon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  ...COVERS
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('echohub-shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

const isAudio = (url) => /\.(mp3|m4a|ogg|wav)$/i.test(url.pathname);

async function fromAudioCache(request) {
  const cache = await caches.open(AUDIO);
  const hit = await cache.match(request.url);
  if (!hit) return null;
  const blob = await hit.blob();
  const size = blob.size;
  const type = hit.headers.get('Content-Type') || 'audio/mpeg';
  const range = request.headers.get('range');
  if (!range) {
    return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } });
  }
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? Number(m[1]) : 0;
  let end = m && m[2] ? Number(m[2]) : size - 1;
  if (m && !m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes'
    }
  });
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Episodes: saved copy first (with range support), otherwise stream from network.
  if (url.origin === location.origin && isAudio(url)) {
    event.respondWith((async () => (await fromAudioCache(request)) || fetch(request))());
    return;
  }

  // Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONTS));
    return;
  }

  if (url.origin !== location.origin) return;

  // App navigations: network first so updates land quickly; fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(request);
        const cache = await caches.open(SHELL);
        cache.put('index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('index.html', { ignoreSearch: true })) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Everything else same-origin (JS, CSS, images): serve fast, refresh in the background.
  event.respondWith(staleWhileRevalidate(request, SHELL));
});
