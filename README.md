# cypress-http-cache

A blazing fast, locally embedded in-memory caching proxy for Cypress to drastically speed up End-to-End (E2E) test suites.

## What it solves
During E2E testing, Cypress often re-fetches the same static assets (JS bundles, CSS, fonts) and API responses repeatedly across different test runs. This introduces unnecessary network latency and CPU overhead, slowing down your test pipeline.

`cypress-http-cache` eliminates these redundant requests. It seamlessly injects an intercepting proxy that caches cacheable HTTP responses natively in-memory. After the first test hits a route, subsequent tests retrieve the response in less than a millisecond.

## Installation

```bash
npm install cypress-http-cache --save-dev
```

## How to configure it

Inject the cache in your `cypress.config.js` (or `.ts`) file inside the `setupNodeEvents` block:

```javascript
const { defineConfig } = require('cypress');
const { installHttpCache } = require('cypress-http-cache');

module.exports = defineConfig({
  e2e: {
    async setupNodeEvents(on, config) {
      return installHttpCache(on, config);
    },
    baseUrl: "http://localhost:3000"
  },
});
```

## Benchmark

By side-stepping the network completely on cache hits, the proxy shaves off round-trip times and browser parsing penalties. 

| Characteristic | Vanilla Cypress Server | `cypress-http-cache` |
| :--- | :--- | :--- |
| **Average Miss** | ~200ms+ | ~200ms+ (Transparent passthrough) |
| **Average Hit**  | — | **< 1ms** |

An in-depth summary is automatically printed to your terminal at the end of every Cypress suite run, detailing your exact Hit Rate, Avg Latency Saved, and Cache Memory Usage.

## How it works

1. **The Interceptor**: The library spins up a fast Node.js proxy server natively and automatically replaces Cypress's `config.baseUrl` to route traffic into it.
2. **Passive Buffering**: When your test traffic misses the cache, it delegates the heavy lifting of streaming the response from your true backend via `http-proxy`, but passively captures the byte chunks.
3. **Memory Safeguards**: It verifies HTTP `Cache-Control` max-age headers to ensure it only caches valid targets. It performs upfront `Content-Length` heuristics and dynamic byte counting to aggressively abort buffering payloads that exceed your max `cacheSize` to prevent V8 memory bloat.
4. **Natural Replay**: On a cache hit, the engine retrieves an array of raw buffers and replays them back to Cypress using a standard Node `Readable` stream. This honors TCP backpressure and perfectly reproduces the way chunk boundaries travelled over the real network wire seamlessly.
