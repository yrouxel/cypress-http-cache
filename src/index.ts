import { startProxy, CacheStats } from './proxy';
import { tmpdir } from 'os';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { spawn } from 'child_process';

export interface HttpCacheOptions {
  /**
   * Maximum cache size in megabytes.
   * Requests larger than this will not be cached.
   * @default 100
   */
  cacheSize?: number;

  /**
   * When to print cache metrics.
   * @default 'after:run'
   */
  stats?: 'never' | 'after:spec' | 'after:run';

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

  /**
   * Indicates if the proxy should be detached.
   * A URL can be provided when starting the server manually.
   * @default false
   */
  detached?: boolean | string;
}

function printCacheSummary(stats: CacheStats) {
  const { hits, misses, bytesUsed, bytesMax, keysCount } = stats;
  const total = hits + misses;
  const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : '0.0';

  const usedMB = (bytesUsed / (1024 * 1024)).toFixed(1);
  const maxMB = (bytesMax / (1024 * 1024)).toFixed(1);

  console.log(
    `[Cypress HTTP Cache] ${hitRate}% hits (${hits}/${total}) | ${usedMB}/${maxMB} MB (${keysCount} keys)`,
  );
}

function isCacheStats(data: any): data is CacheStats {
  const keys: (keyof CacheStats)[] = ['hits', 'misses', 'bytesUsed', 'bytesMax', 'keysCount'];
  return data && typeof data === 'object' && keys.every((key) => typeof data[key] === 'number');
}

async function fetchAndLogStats(proxyOrigin: string): Promise<void> {
  try {
    const res = await fetch(`${proxyOrigin}/__cypress-http-cache__/stats`);
    if (!res.ok) {
      console.debug(`[Cypress HTTP Cache] Stats request failed with status: ${res.status}`);
      return;
    }

    const stats = await res.json();
    if (isCacheStats(stats)) {
      printCacheSummary(stats);
    } else {
      console.debug('[Cypress HTTP Cache] Received invalid stats format: ' + JSON.stringify(stats));
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.debug('[Cypress HTTP Cache] Could not fetch stats: ' + message);
  }
}

/**
 * Creates or reuses an existing proxy.
 * If `detached` is true, the proxy will be started in a separate process and managed via a temp file.
 */
async function createOrReuseProxy(
  target: string,
  config: Cypress.PluginConfigOptions,
  options: HttpCacheOptions,
): Promise<{
  proxyOrigin: string;
  closeCallback?: () => Promise<void>;
}> {
  const {
    cacheSize = 100,
    stats = 'after:run',
    addCacheHeaders = true,
    secure = false,
    detached = false,
  } = options;
  const targetUrl = new URL(target);

  if (typeof detached === 'string') {
    console.debug(`[Cypress HTTP Cache] Using manual proxy at ${detached}`);
    return { proxyOrigin: detached };
  }

  if (!detached) {
    const { port, close } = await startProxy({
      target: targetUrl.origin,
      cacheSize,
      logStats: stats !== 'never',
      addCacheHeaders,
      secure,
    });
    const proxyOrigin = `http://localhost:${port}`;
    console.debug(`[Cypress HTTP Cache] Started in-process proxy at ${proxyOrigin}`);
    return { proxyOrigin, closeCallback: close };
  }

  const hash = createHash('md5').update(config.projectRoot).digest('hex').slice(0, 8);
  const tempFilePath = join(tmpdir(), `cypress-http-cache-${hash}.json`);

  if (existsSync(tempFilePath)) {
    try {
      const existingData = JSON.parse(readFileSync(tempFilePath, 'utf8'));
      process.kill(existingData.pid, 0); // Check if process is alive
      console.debug(
        `[Cypress HTTP Cache] Reusing existing proxy at ${existingData.url} (Background PID: ${existingData.pid})`,
      );
      return { proxyOrigin: existingData.url };
    } catch (e) {
      console.debug('[Cypress HTTP Cache] Found stale proxy data, starting fresh');
      if (existsSync(tempFilePath)) {
        unlinkSync(tempFilePath);
      }
    }
  }

  const serverPath = join(__dirname, 'server.js');
  const spawnArgs = JSON.stringify({
    target: targetUrl.origin,
    cacheSize,
    logStats: stats !== 'never',
    addCacheHeaders,
    secure,
    tempFilePath,
  });

  const child = spawn(process.execPath, [serverPath, spawnArgs], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('[Cypress HTTP Cache] Background proxy failed to start within 5s'));
    }, 5000);

    child.on('message', (data: { url: string; pid: number } | { error: string }) => {
      clearTimeout(timeout);
      child.disconnect();
      child.unref();

      if ('error' in data) {
        reject(new Error(`[Cypress HTTP Cache] Background proxy failed to start: ${data.error}`));
        return;
      }

      console.debug(
        `[Cypress HTTP Cache] ${targetUrl.origin} is now proxied at ${data.url} (Background PID: ${data.pid})`,
      );
      resolve({ proxyOrigin: data.url });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`[Cypress HTTP Cache] Failed to start background proxy: ${err.message}`));
    });
  });
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

  const targetUrl = new URL(target);
  const pathname = target.slice(targetUrl.origin.length);

  const { proxyOrigin, closeCallback } = await createOrReuseProxy(target, config, options);
  config.baseUrl = `${proxyOrigin}${pathname}`;

  const stats = options.stats || 'after:run';
  if (stats === 'after:spec') {
    on('after:spec', async () => {
      await fetchAndLogStats(proxyOrigin);
    });
  }

  on('after:run', async () => {
    if (stats === 'after:run') {
      await fetchAndLogStats(proxyOrigin);
    }

    if (closeCallback) {
      await closeCallback();
    }
  });

  return config;
}
