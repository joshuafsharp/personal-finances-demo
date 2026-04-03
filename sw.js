/// Service Worker — NetworkFirst for all GET requests.
/// When online, fetches from network and updates cache.
/// When offline, serves from cache.

const CACHE_VERSION = 1;
const CACHE_NAME = `pf-cache-v${CACHE_VERSION}`;

self.addEventListener("install", () => {
	// Activate immediately, don't wait for old SW to stop
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	// Claim all open tabs so the SW starts intercepting right away
	event.waitUntil(
		Promise.all([
			self.clients.claim(),
			// Purge old cache versions
			caches.keys().then((keys) =>
				Promise.all(
					keys
						.filter((k) => k.startsWith("pf-cache-") && k !== CACHE_NAME)
						.map((k) => caches.delete(k)),
				),
			),
		]),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;

	// Only cache GET requests
	if (request.method !== "GET") return;

	// Skip chrome-extension and other non-http(s) schemes
	const url = new URL(request.url);
	if (!url.protocol.startsWith("http")) return;

	event.respondWith(
		fetch(request)
			.then((response) => {
				// Only cache successful responses
				if (response.ok) {
					const clone = response.clone();
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(request, clone);
					});
				}
				return response;
			})
			.catch(() => {
				// Network failed — try the cache
				return caches.match(request).then((cached) => {
					if (cached) return cached;
					// Nothing in cache either — return a basic offline response for navigations
					if (request.mode === "navigate") {
						return new Response(
							"<html><body><h1>Offline</h1><p>This page hasn't been cached yet. Visit it while connected first.</p></body></html>",
							{ status: 503, headers: { "Content-Type": "text/html" } },
						);
					}
					return new Response("Offline", { status: 503 });
				});
			}),
	);
});
