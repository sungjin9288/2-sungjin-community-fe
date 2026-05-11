const CACHE_NAME = 'community-cache-v4';
const STATIC_ASSETS = [
    '/css/design-system.css',
    '/css/common.css',
    '/js/utils.js',
    '/js/header.js',
    '/images/default-profile.png',
];

// ===========================
// Install: 핵심 정적 자원 프리캐시
// ===========================
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

// ===========================
// Activate: 이전 버전 캐시 정리
// ===========================
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// ===========================
// Fetch: 요청 유형별 전략 분기
// ===========================
self.addEventListener('fetch', (event) => {
    // GET 요청만 처리
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    if (url.origin !== self.location.origin) return;

    // API 요청은 캐시하지 않고 바이패스
    if (url.pathname.startsWith('/api/')) return;

    // CSS/JS는 Network-first로 갱신 지연을 막고, 이미지는 Cache-first로 유지
    const isCodeAsset =
        url.hostname === self.location.hostname &&
        (url.pathname.startsWith('/css/') ||
         url.pathname.startsWith('/js/'));
    const isImageAsset =
        url.hostname === self.location.hostname &&
        url.pathname.startsWith('/images/');

    if (isCodeAsset) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    if (isImageAsset) {
        event.respondWith(
            caches.match(event.request).then((cached) =>
                cached || fetch(event.request).then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
                    }
                    return response;
                })
            )
        );
        return;
    }

    // HTML 페이지 요청 → Network-first, 실패 시 캐시, 완전 실패 시 오프라인 메시지
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() =>
                    caches.match(event.request).then(
                        (cached) =>
                            cached ||
                            new Response(
                                `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>오프라인</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;">
  <h1>오프라인 상태입니다.</h1>
  <p>네트워크 연결을 확인하고 다시 시도해 주세요.</p>
  <button onclick="location.reload()">다시 시도</button>
</body>
</html>`,
                                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                            )
                    )
                )
        );
        return;
    }

    // 그 외 요청 → Stale-while-revalidate
    event.respondWith(
        caches.open(CACHE_NAME).then((cache) =>
            cache.match(event.request).then((cached) => {
                const fetchPromise = fetch(event.request).then((response) => {
                    if (response.ok) cache.put(event.request, response.clone());
                    return response;
                });
                return cached || fetchPromise;
            })
        )
    );
});
