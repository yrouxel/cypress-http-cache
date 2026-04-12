import http, { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';
import httpProxy from 'http-proxy';
import { LRUCache } from 'lru-cache';
import { performance } from 'perf_hooks';
import { Readable } from 'stream';

export interface CacheStats {
  hits: number;
  misses: number;
  hitTime: number;
  missTime: number;
  timeSaved: number;
  bytesUsed: number;
  bytesMax: number;
  keysCount: number;
}

export interface ProxyOptions {
  target: string;
  cacheSize?: number;
  logStats?: boolean;
  addCacheHeaders?: boolean;
}

interface CacheEntry {
  headers: IncomingHttpHeaders;
  chunks: Buffer[];
  totalLength: number;
  originalDuration: number;
}

export function startProxy({
  target,
  cacheSize,
  logStats,
  addCacheHeaders,
}: Required<ProxyOptions>): Promise<{ port: number; close: () => Promise<CacheStats> }> {
  return new Promise((resolve) => {
    const cache = new LRUCache<string, CacheEntry>({
      maxSize: cacheSize * 1024 * 1024,
      sizeCalculation: (val) => val.totalLength,
    });

    const requestStartTimes = new WeakMap<IncomingMessage, number>();
    const stats = { hits: 0, misses: 0, hitTime: 0, missTime: 0, timeSaved: 0 };
    const proxy = httpProxy.createProxyServer({ target, ws: true, changeOrigin: true });

    proxy.on('proxyRes', (proxyRes, req) => {
      const extReq = req;
      if (extReq.method !== 'GET') {
        return;
      }

      const cacheControl = proxyRes.headers['cache-control'] || '';
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;

      const isCacheable =
        proxyRes.statusCode === 200 && maxAge > 0 && !/no-store/i.test(cacheControl);

      if (!isCacheable) {
        return;
      }

      if (logStats) stats.misses++;
      if (addCacheHeaders) proxyRes.headers['x-cache'] = 'MISS';

      const maxLimit = cache.maxSize;
      const contentLengthStr = proxyRes.headers['content-length'] || '0';
      const contentLength = parseInt(contentLengthStr, 10);
      if (contentLength > maxLimit) {
        return;
      }

      let chunks: Buffer[] = [];
      let currentSize = 0;

      proxyRes.on('data', (c: Buffer) => {
        if (currentSize > maxLimit) {
          chunks = [];
          return;
        }
        currentSize += c.length;
        chunks.push(c);
      });

      proxyRes.on('end', () => {
        let originalDuration = 0;
        if (logStats) {
          const startTime = requestStartTimes.get(extReq);
          if (startTime) {
            originalDuration = performance.now() - startTime;
            stats.missTime += originalDuration;
            requestStartTimes.delete(extReq);
          }
        }

        if (currentSize > maxLimit || !extReq.url) {
          return;
        }
        cache.set(
          extReq.url,
          { headers: proxyRes.headers, chunks: chunks, totalLength: currentSize, originalDuration },
          { ttl: maxAge * 1000 },
        );
      });
    });

    proxy.on('error', (err, req, res) => {
      console.error(`[Cypress HTTP Cache] Upstream Error (${req.url}):`, err.message);
      const serverRes = res as any;
      if (serverRes?.writeHead && !serverRes.headersSent) {
        serverRes.writeHead(502).end('Bad Gateway');
      } else if (serverRes?.destroy) {
        serverRes.destroy();
      }
    });

    const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
      let startTime = 0;
      if (logStats) {
        startTime = performance.now();
        requestStartTimes.set(req, startTime);
      }

      let cacheBody: CacheEntry | undefined;
      if (req.method === 'GET' && req.url && (cacheBody = cache.get(req.url))) {
        const { headers, chunks, originalDuration } = cacheBody;

        let duration = 0;
        if (logStats) {
          stats.hits++;
          duration = performance.now() - startTime;
          stats.hitTime += duration;
          stats.timeSaved += originalDuration - duration;
        }

        const enhancedHeaders: IncomingHttpHeaders = { ...headers };
        if (addCacheHeaders) {
          enhancedHeaders['X-Cache'] = 'HIT';
          if (logStats) {
            enhancedHeaders['Server-Timing'] = `cache;desc="Hit";dur=${duration.toFixed(2)}`;
          } else {
            enhancedHeaders['Server-Timing'] = `cache;desc="Hit"`;
          }
        }

        res.writeHead(200, enhancedHeaders);
        return Readable.from(chunks).pipe(res);
      }

      proxy.web(req, res);
    });

    server.on('upgrade', (req, socket, head) => proxy.ws(req, socket, head));

    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({
        port,
        close: () =>
          new Promise((resFn) => {
            server.close(() => {
              proxy.close();
              resFn({
                ...stats,
                bytesUsed: cache.calculatedSize || 0,
                bytesMax: cache.maxSize,
                keysCount: cache.size,
              });
            });
          }),
      });
    });
  });
}
