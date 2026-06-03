/* ============================================================
   Service Worker - نظام الأقساط
   - كاش كامل للعمل بدون إنترنت
   - Background Sync لمزامنة العمليات المعلقة
   ============================================================ */

const CACHE_NAME = 'installments-v1';
const SYNC_TAG = 'firebase-sync';

// الملفات التي تُكاش للعمل أوفلاين
const STATIC_ASSETS = [
  './installments.html',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
];

// CDN assets to cache on first use
const CDN_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://www.gstatic.com',
  'https://firestore.googleapis.com',
];

// ===== INSTALL =====
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ===== ACTIVATE =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ===== FETCH - Offline First Strategy =====
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase / Firestore - Network First (لا نتدخل في الطلبات الأصلية)
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // إذا فشل الطلب لـ Firebase → نتجاهل (IDB يتولى الأمر)
        return new Response(JSON.stringify({ offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Google Fonts - Cache First
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(res => {
            cache.put(event.request, res.clone());
            return res;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // الملفات المحلية - Cache First, Network Fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => {
        // Fallback to main HTML for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('./installments.html');
        }
      });
    })
  );
});

// ===== BACKGROUND SYNC =====
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(processPendingQueue());
  }
});

async function processPendingQueue() {
  // نرسل رسالة لجميع الـ clients لتشغيل المزامنة
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_NOW', tag: SYNC_TAG });
  });
}

// ===== PUSH NOTIFICATIONS (مستقبلاً) =====
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'نظام الأقساط', {
      body: data.body || '',
      icon: './icons/icon-192.svg',
      badge: './icons/icon-192.svg',
      dir: 'rtl',
      lang: 'ar',
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('./installments.html');
    })
  );
});

// ===== MESSAGE HANDLER =====
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CACHE_UPDATED') {
    // إعادة كاش الملف الرئيسي عند التحديث
    caches.open(CACHE_NAME).then(cache => cache.add('./installments.html'));
  }
});
