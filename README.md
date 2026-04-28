# cypress-http-cache

A blazing fast in-memory HTTP cache to speed up Cypress End-to-End test suites.

## What it solves

With `npx cypress run`, Cypress uses a fresh browser for each test file. This completely wipes the browser cache, canceling its performance benefits and rendering it useless. 
`cypress-http-cache` aims to solve this problem through an in-memory caching proxy that persists through the test run. This proxy sits between Cypress and your web application and caches its assets for faster page loading.

## Compatibility

Cypress 10+

## Installation

```bash
npm install cypress-http-cache --save-dev
```

## How to configure it

In your config file, call `installHttpCache` in the `setupNodeEvents` block:

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

## Options

You can pass an optional configuration object as the third argument to `installHttpCache`:

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `cacheSize` | `number` | `100` | Maximum cache size in megabytes. Requests larger than this will not be cached. |
| `logStats` | `boolean` | `true` | See below. |
| `addCacheHeaders` | `boolean` | `true` | Whether to inject proxy diagnostic headers (`X-Cache` and `Server-Timing`) into network responses. |
| `secure` | `boolean` | `false` | Whether to verify the upstream server's TLS certificate. |

> **Tip:** If you enable `secure` and your target uses a private or internal CA, trust it via the standard Node.js environment variable:
> `NODE_EXTRA_CA_CERTS=/path/to/ca.pem npx cypress run`

## Stats

When `logStats` is enabled, an in-depth summary is automatically printed to your terminal at the end of every Cypress suite run, detailing the usage of the cache.

```text
===================================================
📦  Cypress HTTP Cache Summary
===================================================
Total Time Saved: ~56.16s
Hit Rate:         87.6% (269 Hits / 307 Total Requests)
Cache Usage:      0.5 MB / 100.0 MB (38 Cached Keys)

-- Diagnostics --
Avg Hit Latency:  0.03ms | Avg Miss: 213.43ms
Avg Hits per Key: 7.1 (269 Hits / 38 Keys)
===================================================
```

## Small print

Author: Yoann Rouxel &copy; 2026

License: MIT - do anything with the code, but don't blame me if it does not work.

Support: if you find any problems with this module [open issue](https://github.com/yrouxel/cypress-http-cache/issues) on Github