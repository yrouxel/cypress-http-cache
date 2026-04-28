import { startProxy, CacheStats } from './proxy';

export interface HttpCacheOptions {
  /**
   * Maximum cache size in megabytes.
   * Requests larger than this will not be cached.
   * @default 100
   */
  cacheSize?: number;

  /**
   * Whether to record hits/misses and output a metrics
   * summary to the console upon test completion.
   * @default true
   */
  logStats?: boolean;

  /**
   * Whether to inject proxy diagnostic headers ('X-Cache'
   * and 'Server-Timing') into network responses.
   * @default true
   */
  addCacheHeaders?: boolean;

  /**
   * Whether to verify the upstream server's TLS certificate.
   * Set to `true` to enforce strict validation.
   * @default false
   */
  secure?: boolean;
}

function printCacheSummary(stats: CacheStats) {
  const { hits, misses, hitTime, missTime, bytesUsed, bytesMax, keysCount, timeSaved } = stats;
  const total = hits + misses;
  const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : '0.0';
  const keyHitRate = keysCount > 0 ? (hits / keysCount).toFixed(1) : '0.0';

  const avgHit = hits > 0 ? (hitTime / hits).toFixed(2) : '0.0';
  const avgMiss = misses > 0 ? (missTime / misses).toFixed(2) : '0.0';

  const usedMB = (bytesUsed / (1024 * 1024)).toFixed(1);
  const maxMB = (bytesMax / (1024 * 1024)).toFixed(1);

  const formattedTimeSaved = timeSaved > 1000 
    ? `${(timeSaved / 1000).toFixed(2)}s` 
    : `${timeSaved.toFixed(2)}ms`;

  console.log('\n===================================================');
  console.log('📦  Cypress HTTP Cache Summary');
  console.log('===================================================');
  console.log(`Total Time Saved: ~${formattedTimeSaved}`);
  console.log(`Hit Rate:         ${hitRate}% (${hits} Hits / ${total} Total Requests)`);
  console.log(`Cache Usage:      ${usedMB} MB / ${maxMB} MB (${keysCount} Cached Keys)`);
  console.log('');
  console.log('-- Diagnostics --');
  console.log(`Avg Hit Latency:  ${avgHit}ms | Avg Miss: ${avgMiss}ms`);
  console.log(`Avg Hits per Key: ${keyHitRate} (${hits} Hits / ${keysCount} Keys)`);
  console.log('===================================================\n');
}

/**
 * Installs the HTTP Cache proxy and binds it to the Cypress lifecycle.
 * Updates the `baseUrl` inside the Cypress config to route traffic through the proxy.
 *
 * @example
 * ```typescript
 * import { defineConfig } from "cypress";
 * import { installHttpCache } from "cypress-http-cache";
 *
 * export default defineConfig({
 *   e2e: {
 *     baseUrl: "http://localhost:3000",
 *     async setupNodeEvents(on, config) {
 *       return installHttpCache(on, config);
 *     },
 *   },
 * });
 * ```
 */
export async function installHttpCache(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  options: HttpCacheOptions = {},
): Promise<Cypress.PluginConfigOptions> {
  const target = config.baseUrl;
  if (!target) return config;

  const { cacheSize = 100, logStats = true, addCacheHeaders = true, secure = false } = options;
  const targetUrl = new URL(target);
  const { port, close } = await startProxy({ target: targetUrl.origin, cacheSize, logStats, addCacheHeaders, secure });
  const pathname = target.slice(targetUrl.origin.length);
  config.baseUrl = `http://localhost:${port}${pathname}`;
  console.debug(`[Cypress HTTP Cache] ${target} is now proxied at ${config.baseUrl}`);

  on('after:run', async () => {
    const stats = await close();
    if (logStats) {
      printCacheSummary(stats);
    }
  });

  return config;
}
