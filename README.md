# cypress-http-cache

A blazing fast HTTP cache to drastically speed up Cypress End-to-End test suites.

## What it solves

In Run mode `npm cypress run`, Cypress uses a fresh browser for each test file. This completely wipes the browser cache, rendering its performance benefits useless.
`cypress-http-cache` aims to partly solve this problem through a caching proxy. This proxy sits between Cypress and your web application.

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

## Stats

When `logStats` is enabled, an in-depth summary is automatically printed to your terminal at the end of every Cypress suite run, detailing the usage of the cache.

```text
===================================================
📦  Cypress In-Memory Cache Summary
===================================================
Hit Rate:         50.0% (1 Hits / 1 Misses)
Avg Key Hit Rate: 1.0 (1 Hits / 1 Keys)
Avg Hit Latency:  0.1ms
Avg Miss Latency: 503.9ms
Est. Time Saved:  503.8ms
Cache Usage:      0.0 MB / 100.0 MB
===================================================
```

## Small print

Author: Yoann Rouxel &copy; 2026

License: MIT - do anything with the code, but don't blame me if it does not work.

Support: if you find any problems with this module [open issue](https://github.com/yrouxel/cypress-http-cache/issues) on Github