// ============================================================
//  sw.js — 旅行記帳 PWA Service Worker
//  部署位置：與 index.html 同層
//  改動 index.html 後請把 CACHE_NAME 的版本號 +1，使用者才會收到更新提示
// ============================================================

const CACHE_NAME = 'travel-ledger-v19';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './icon-maskable.png'
];

// ── 接收主頁面指令（立即套用新版）──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Install：預先快取 ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) { return cache.addAll(PRECACHE_URLS); })
      .then(function() { return self.skipWaiting(); })
  );
});

// ── Activate：清掉舊版快取 ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n){ return n !== CACHE_NAME; })
             .map(function(n){ return caches.delete(n); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// ── Fetch：同源用 Cache First（離線可用），跨網域（Gemini／Firebase）直接放行 ──
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // 背景更新快取，下次開啟就是新版
        fetch(event.request).then(function(res) {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(function(c){ c.put(event.request, clone); });
          }
        }).catch(function(){});
        return cached;
      }
      return fetch(event.request).then(function(res) {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(function(c){ c.put(event.request, clone); });
        return res;
      }).catch(function() {
        return new Response('目前離線，請稍後再試。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});
