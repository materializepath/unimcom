/// <reference lib="webworker" />

// Set to > 0 if the DSP is polyphonic
const FAUST_DSP_VOICES = 0;
// Set to true if the DSP has an effect
const FAUST_DSP_HAS_EFFECT = false;

const CACHE_NAME = "ambient_m7_3.0_webapp_20260530perf1";
const INDEX_ASSET_VERSION = "20260530perf1";
const CREATE_NODE_MODULE_VERSION = "20260530perf1";
const FAUST_UI_MODULE_VERSION = "20260521seq4";
const FAUST_UI_STYLES_VERSION = "20260303r25";

/**
 * List of essential resources required for the **Mono DSP** version of the application.
 *
 * - These files are cached to enable offline functionality and improve loading speed.
 * - Includes the main HTML, JavaScript, and CSS files required for the app.
 * - Contains Faust-related files needed for DSP processing.
 */
const MONO_RESOURCES = [
    "./index.html",
    `./index.js?v=${INDEX_ASSET_VERSION}`,
    `./create-node.js?v=${CREATE_NODE_MODULE_VERSION}`,
    `./faust-ui/index.js?v=${FAUST_UI_MODULE_VERSION}`,
    `./faust-ui/index.css?v=${FAUST_UI_STYLES_VERSION}`,
    "./faustwasm/index.js",
    "./dsp-module.wasm",
    "./dsp-meta.json"
];

// Resources that are useful but not required for first render/audio boot.
// Keep these runtime-cacheable but do not prefetch them during SW install.
const OPTIONAL_LAZY_RESOURCES = [
    "./vendor/three.module.min.js",
];

/**
 * List of resources for the **Polyphonic DSP** version of the application.
 *
 * - Extends the mono resource list by adding a **mixer module**.
 * - The mixer module is required to handle multiple simultaneous voices used in a polyphonic instrument.
 */
const POLY_RESOURCES = [
    ...MONO_RESOURCES,
    "./mixer-module.wasm",
];

/**
 * List of resources for the **Polyphonic DSP with Effects** version.
 *
 * - Extends the polyphonic resource list by adding an **effect module**.
 * - The effect module allows applying audio effects to the polyphonic instrument.
 */
const POLY_EFFECT_RESOURCES = [
    ...POLY_RESOURCES,
    "./effect-module.wasm",
    "./effect-meta.json",
];

/** @type {ServiceWorkerGlobalScope} */
const serviceWorkerGlobalScope = self;

const getConfiguredResources = () => (
    (FAUST_DSP_VOICES && FAUST_DSP_HAS_EFFECT)
        ? POLY_EFFECT_RESOURCES
        : (FAUST_DSP_VOICES ? POLY_RESOURCES : MONO_RESOURCES)
);

/**
 * Build the install-time precache list:
 * - omit optional lazy assets
 * - dedupe exact request URLs
 *
 * @returns {string[]}
 */
function getPrecacheResources() {
    const optionalURLs = new Set(
        OPTIONAL_LAZY_RESOURCES.map((resource) => new URL(resource, serviceWorkerGlobalScope.registration.scope).href)
    );
    const deduped = [];
    const seen = new Set();
    for (const resource of getConfiguredResources()) {
        const absolute = new URL(resource, serviceWorkerGlobalScope.registration.scope).href;
        if (optionalURLs.has(absolute) || seen.has(absolute)) continue;
        seen.add(absolute);
        deduped.push(resource);
    }
    return deduped;
}

/**
 * Normalize request paths relative to this service worker's scope. This keeps
 * the cache policy correct whether the app is deployed at `/` or a test path.
 *
 * @param {URL} url
 * @returns {string}
 */
function getScopedPath(url) {
    const scopePath = new URL(serviceWorkerGlobalScope.registration.scope).pathname.replace(/\/$/, "");
    let pathname = url.pathname;
    if (scopePath && pathname.startsWith(`${scopePath}/`)) {
        pathname = pathname.slice(scopePath.length);
    } else if (scopePath && pathname === scopePath) {
        pathname = "/";
    }
    return pathname === "/" || pathname === "" ? "/index.html" : pathname;
}

/**
 * @param {string} resource
 * @returns {string}
 */
function getResourcePath(resource) {
    const url = new URL(resource, serviceWorkerGlobalScope.registration.scope);
    return getScopedPath(url);
}

const CACHEABLE_RESOURCE_PATHS = new Set(
    [...getConfiguredResources(), ...OPTIONAL_LAZY_RESOURCES].map(getResourcePath)
);
CACHEABLE_RESOURCE_PATHS.add("/service-worker.js");

const NETWORK_FIRST_PATHS = new Set([
    "/index.html",
    "/index.js",
    "/create-node.js",
    "/service-worker.js",
    "/faust-ui/index.js",
    "/faust-ui/index.css",
]);

/**
 * @param {Request} request
 * @param {URL} requestURL
 * @returns {boolean}
 */
function shouldCacheRequest(request, requestURL) {
    return request.method === "GET"
        && requestURL.origin === serviceWorkerGlobalScope.location.origin
        && CACHEABLE_RESOURCE_PATHS.has(getScopedPath(requestURL));
}

/**
 * @param {Response} response
 * @returns {boolean}
 */
function isCacheableResponse(response) {
    return !!response && response.status === 200 && response.type === "basic";
}

/**
 * Install the service worker, cache essential resources, and prepare for immediate activation.
 */
serviceWorkerGlobalScope.addEventListener("install", (event) => {
    console.log("Service worker installed");
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        const precacheResources = getPrecacheResources();
        try {
            await cache.addAll(precacheResources);
            await serviceWorkerGlobalScope.skipWaiting();
        } catch (error) {
            console.error("Failed to cache resources during install:", error);
        }
    })());
});

/**
 * Handles activation: deletes old caches, claims clients, then reloads controlled windows.
 */
serviceWorkerGlobalScope.addEventListener("activate", (event) => {
    console.log("Service worker activated");
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter((cacheName) => cacheName !== CACHE_NAME)
                .map((cacheName) => caches.delete(cacheName))
        );
        await clients.claim();
        const windows = await clients.matchAll({ type: "window" });
        windows.forEach((client) => {
            client.navigate(client.url);
        });
    })());
});

/**
 * Adds defensive headers to same-origin cached responses.
 *
 * @param {Response} response - The original HTTP response object.
 * @returns {Response} A new response with updated security headers.
 */
const getHardenedSameOriginResponse = (response) => {
    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "credentialless");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
};

/**
 * Intercepts fetch requests. Only the explicit static app allowlist is cached;
 * other same-origin paths are fetched from the network and never persisted.
 *
 * @param {FetchEvent} event - The fetch event triggered by the browser.
 */
serviceWorkerGlobalScope.addEventListener("fetch", (event) => {
    event.respondWith((async () => {
        const requestURL = new URL(event.request.url);
        const isSameOrigin = requestURL.origin === serviceWorkerGlobalScope.location.origin;
        const scopedPath = isSameOrigin ? getScopedPath(requestURL) : "";
        const shouldCache = shouldCacheRequest(event.request, requestURL);
        const cache = shouldCache ? await caches.open(CACHE_NAME) : null;
        const isNetworkFirst = shouldCache && NETWORK_FIRST_PATHS.has(scopedPath);

        if (!isSameOrigin) {
            return fetch(event.request);
        }

        if (isNetworkFirst) {
            try {
                const freshResponse = await fetch(event.request);
                if (isCacheableResponse(freshResponse)) {
                    const modifiedResponse = getHardenedSameOriginResponse(freshResponse);
                    await cache.put(event.request, modifiedResponse.clone());
                    return modifiedResponse;
                }
                return freshResponse;
            } catch (error) {
                const fallback = await cache.match(event.request);
                if (fallback) return getHardenedSameOriginResponse(fallback);
                console.error("Network access error", error);
                return new Response("Network error", { status: 503, statusText: "Service Unavailable" });
            }
        }

        if (shouldCache) {
            const cachedResponse = await cache.match(event.request);
            if (cachedResponse) {
                return getHardenedSameOriginResponse(cachedResponse);
            }
        }

        try {
            const fetchResponse = await fetch(event.request);
            if (shouldCache && isCacheableResponse(fetchResponse)) {
                const modifiedResponse = getHardenedSameOriginResponse(fetchResponse);
                await cache.put(event.request, modifiedResponse.clone());
                return modifiedResponse;
            }
            return fetchResponse;
        } catch (error) {
            console.error("Network access error", error);
            return new Response("Network error", { status: 503, statusText: "Service Unavailable" });
        }
    })());
});
