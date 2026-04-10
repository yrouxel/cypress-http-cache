const http = require('http');
const httpProxy = require('http-proxy');
const { LRUCache } = require('lru-cache');
const { performance } = require('perf_hooks');
const { Readable } = require('stream');

function startProxy({ target, cacheSize = 100 }) {
  return new Promise((resolve) => {
    const cache = new LRUCache({
      maxSize: cacheSize * 1024 * 1024,
      sizeCalculation: (val) => val.totalLength,
    });
    
    const stats = { hits: 0, misses: 0, hitTime: 0, missTime: 0 };
    const proxy = httpProxy.createProxyServer({ target, ws: true, changeOrigin: true });

    proxy.on('proxyRes', (proxyRes, req, res) => {
      if (req.method !== 'GET') return;
      
      const cacheControl = proxyRes.headers['cache-control'] || '';
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
      
      const isCacheable = proxyRes.statusCode === 200 
        && maxAge > 0 
        && !/no-store/i.test(cacheControl);

      if (!isCacheable) {
        return;
      }
      
      stats.misses++;
      proxyRes.headers['x-cache'] = 'MISS';

      const maxLimit = cache.maxSize;
      const contentLength = parseInt(proxyRes.headers['content-length'] || '0', 10);
      if (contentLength > maxLimit) {
        return;
      }

      let chunks = [];
      let currentSize = 0;

      proxyRes.on('data', (c) => {
        if (currentSize > maxLimit) {
          chunks = [];
          return;
        }
        currentSize += c.length;
        chunks.push(c);
      });
      
      proxyRes.on('end', () => {
        if (currentSize > maxLimit) return;
        cache.set(req.url, { headers: proxyRes.headers, chunks: chunks, totalLength: currentSize }, { ttl: maxAge * 1000 });
        
        if (req.startTime) {
          stats.missTime += (performance.now() - req.startTime);
        }
      });
    });

    proxy.on('error', (err, req, res) => {
      if (res?.writeHead && !res.headersSent) res.writeHead(502).end('Bad Gateway');
    });

    const server = http.createServer((req, res) => {
      req.startTime = performance.now();

      let cacheBody;
      if (req.method === 'GET' && (cacheBody = cache.get(req.url))) {
        stats.hits++;
        const { headers, chunks } = cacheBody;
        const duration = performance.now() - req.startTime;
        stats.hitTime += duration;

        const enhancedHeaders = { 
          ...headers, 
          'X-Cache': 'HIT',
          'Server-Timing': `cache;desc="Hit";dur=${duration.toFixed(2)}`
        };
        
        res.writeHead(200, enhancedHeaders);
        return Readable.from(chunks).pipe(res);
      }

      proxy.web(req, res);
    });

    server.on('upgrade', (req, socket, head) => proxy.ws(req, socket, head));

    server.listen(0, () => {
      resolve({ 
        port: server.address().port, 
        close: () => new Promise((resFn) => {
          server.close(() => {
            proxy.close();
            resFn({
              ...stats,
              bytesUsed: cache.calculatedSize || 0,
              bytesMax: cache.maxSize,
              keysCount: cache.size
            });
          });
        })
      });
    });
  });
}

module.exports = { startProxy };
