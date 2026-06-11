// ACLS Service Worker — minimal, damit die Website installierbar ist (PWA).
// Bewusst KEIN Caching: HTML/JS/API kommen immer frisch vom Server,
// damit es nie veraltete Versionen gibt. Offline-Support kann später
// ergänzt werden, ohne dass sich für die Nutzer etwas ändert.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* Netzwerk-Durchreiche */ });
