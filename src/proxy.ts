import { createServer, IncomingHttpHeaders } from 'http';
import { createProxyServer } from 'http-proxy';
import { LRUCache } from 'lru-cache';
import { Readable } from 'stream';

export interface CacheStats {
  hits: number;
  misses: number;
  bytesUsed: number;
  bytesMax: number;
  keysCount: number;
}

export interface ProxyOptions {
  target: string;
  cacheSize?: number;
  logStats?: boolean;
  addCacheHeaders?: boolean;
  secure?: boolean;
}

interface CacheEntry {
  headers: IncomingHttpHeaders;
  chunks: Buffer[];
  totalLength: number;
}

export function startProxy({
  target,
  cacheSize,
  logStats,
  addCacheHeaders,
  secure,
}: Required<ProxyOptions>): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const cache = new LRUCache<string, CacheEntry>({
      maxSize: cacheSize * 1024 * 1024,
      sizeCalculation: (val) => val.totalLength,
    });

    const stats = { hits: 0, misses: 0 };
    const proxy = createProxyServer({ target, ws: true, changeOrigin: true, secure });

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
        if (currentSize > maxLimit || !extReq.url) {
          return;
        }
        cache.set(
          extReq.url,
          { headers: proxyRes.headers, chunks: chunks, totalLength: currentSize },
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

    const server = createServer((req, res) => {
      if (logStats && req.method === 'GET' && req.url === '/__cypress-http-cache__/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ...stats,
            bytesUsed: cache.calculatedSize || 0,
            bytesMax: cache.maxSize,
            keysCount: cache.size,
          }),
        );
        return;
      }

      let cacheBody: CacheEntry | undefined;
      if (req.method === 'GET' && req.url && (cacheBody = cache.get(req.url))) {
        const { headers, chunks } = cacheBody;

        if (logStats) {
          stats.hits++;
        }

        const enhancedHeaders: IncomingHttpHeaders = { ...headers };
        if (addCacheHeaders) {
          enhancedHeaders['X-Cache'] = 'HIT';
          enhancedHeaders['Server-Timing'] = `cache;desc="Hit"`;
        }

        res.writeHead(200, enhancedHeaders);
        return Readable.from(chunks).pipe(res);
      }

      proxy.web(req, res);
    });

    server.on('upgrade', (req, socket, head) => proxy.ws(req, socket, head));
    server.on('error', (err) => {
      reject(new Error(`[Cypress HTTP Cache] Failed to start proxy: ${err.message}`));
    });
    server.listen(0, () => {
      const address = server.address();
      if (!address) {
        reject(new Error('[Cypress HTTP Cache] Failed to retrieve proxy server address'));
        return;
      }

      if (typeof address === 'string') {
        reject(
          new Error(
            `[Cypress HTTP Cache] Unexpected server address format (Unix socket): ${address}`,
          ),
        );
        return;
      }

      resolve({
        port: address.port,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => {
              proxy.close();
              resolveClose();
            });
          }),
      });
    });
  });
}
