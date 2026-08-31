
const CACHE = "xinmiao-net-v2.5";
const CORE = [
  "/", "/index.html", "/style.css", "/app.js", "/config.js",
  "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  // API always network first; static shell can fall back to cache.
  if(url.pathname.startsWith("/api/") || url.pathname==="/health" || url.pathname==="/quality"){
    event.respondWith(fetch(req).catch(()=>caches.match(req)));
    return;
  }

  event.respondWith(
    fetch(req).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});
      return res;
    }).catch(()=>caches.match(req).then(r=>r || caches.match("/index.html")))
  );
});
