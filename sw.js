'use strict';

// Service worker: makes Mini Games work with no connection at all (in the car,
// on a plane, when the Wi-Fi drops).
//
// - On install it saves the menu, the game list, and every game listed in
//   games/games.json, including the scripts, styles and images each game's
//   index.html links to. New games are picked up automatically; nothing to
//   list here.
// - After that, every request goes to the network first so updates show up
//   right away, and falls back to the saved copy when offline.
//
// Service workers only run on HTTPS (like GitHub Pages) or localhost. On a
// plain http:// home server the menu simply skips registering it.

const CACHE = 'mini-games-v1';
const NETWORK_TIMEOUT_MS = 4000;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'shared/home-button.js',
  'games/games.json',
];

// Local files a game page references via src="..." or href="...".
function linkedFiles(html, pageUrl) {
  const urls = new Set();
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#?]+)["']/g)) {
    const url = new URL(m[1], pageUrl);
    if (url.origin === self.location.origin) urls.add(url.href);
  }
  return [...urls];
}

async function precacheEverything() {
  const cache = await caches.open(CACHE);
  // One missing file shouldn't stop the rest from being saved.
  const save = url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {});
  await Promise.all(SHELL.map(save));

  let games = [];
  try {
    const res = await fetch('games/games.json', { cache: 'reload' });
    games = (await res.json()).games || [];
  } catch (e) { /* offline during install: the shell is still saved */ }

  await Promise.all(games.map(async g => {
    const pageUrl = new URL(`games/${g.id}/`, self.registration.scope).href;
    try {
      const res = await fetch(pageUrl, { cache: 'reload' });
      if (!res.ok) return;
      await cache.put(pageUrl, res.clone());
      const files = linkedFiles(await res.text(), pageUrl);
      files.push(new URL(g.icon || 'icon.svg', pageUrl).href);
      await Promise.all(files.map(save));
    } catch (e) { /* skip this game */ }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precacheEverything().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Fresh from the network when possible. If the network fails, or is so slow
// that a saved copy would be better, use the saved copy.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const fromNetwork = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  fromNetwork.catch(() => {}); // handled below; avoid unhandled-rejection noise
  const slow = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS, 'slow'));
  const saved = () => cache.match(request, { ignoreSearch: true });

  try {
    const first = await Promise.race([fromNetwork, slow]);
    if (first !== 'slow') return first;
    return (await saved()) || fromNetwork; // nothing saved yet: keep waiting
  } catch (e) {
    const cached = await saved();
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});
