// Minimal service worker: caches static assets only, never API responses.
const CACHE = "hipertai-static-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok && url.pathname.startsWith("/assets/")) {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
                }
                return response;
            })
            .catch(() => caches.match(event.request).then((hit) => hit ?? Response.error())),
    );
});

// Tapping a notification brings the app forward, or opens it if it was closed.
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
            const open = windows.find((client) => "focus" in client);
            return open ? open.focus() : self.clients.openWindow("/");
        }),
    );
});
