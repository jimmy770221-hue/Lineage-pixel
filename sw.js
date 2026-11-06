// 天堂像素版 Service Worker
// 讓遊戲可以「安裝到桌面/主畫面」成為獨立App，並提供離線快取(圖片/音效載入過一次後，
// 離線或網路不穩時也能照常遊玩；index.html本身每次都優先抓最新版，確保更新後玩家能立刻拿到新內容)。

const CACHE_VERSION = 'v80.36-1';           // 每次正式更新版本號時手動遞增，瀏覽器才會清掉舊快取換新的
const SHELL_CACHE = 'lineage-pixel-shell-' + CACHE_VERSION;
const ASSET_CACHE  = 'lineage-pixel-assets-' + CACHE_VERSION;

// App Shell：啟動必要的骨架檔案，安裝時就先快取好
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-icon-192.png',
  './icons/maskable-icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())           // 新版本安裝完立刻準備接管，不用等所有分頁關閉
      .catch((err) => console.warn('[SW] shell precache failed:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== SHELL_CACHE && n !== ASSET_CACHE)
           .map((n) => caches.delete(n))          // 清掉舊版本殘留的快取，避免越滾越大
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;               // 非GET(例如外部API POST)一律不經過快取處理
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 跨網域請求不處理，交給瀏覽器預設行為

  // index.html / manifest.json：Network-first，確保玩家只要有網路就一定拿到最新版本，
  // 真的離線連不上時才退回快取版本，讓遊戲至少還能打開
  const isShellDoc = req.mode === 'navigate' ||
    url.pathname.endsWith('/index.html') || url.pathname.endsWith('/manifest.json') ||
    url.pathname === '/' || url.pathname.endsWith('/');
  if (isShellDoc) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // assets/ 底下的圖片與其他靜態資源：Cache-first，載入過一次後離線也能用；
  // 背景同時悄悄向網路要一份更新快取(stale-while-revalidate)，下次就會是新的
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
