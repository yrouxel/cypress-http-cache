const { startProxy } = require('./proxy');

function printCacheSummary(stats) {
  const { hits, misses, hitTime, missTime, bytesUsed, bytesMax, keysCount } = stats
  const total = hits + misses;
  const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : '0.0';
  const keyHitRate = keysCount > 0 ? (hits / keysCount).toFixed(1) : '0.0';
  
  const avgHit = hits > 0 ? (hitTime / hits).toFixed(1) : '0.0';
  const avgMiss = misses > 0 ? (missTime / misses).toFixed(1) : '0.0';
  
  const estimatedTimeSaved = hits > 0 && misses > 0 ? 
    ((missTime / misses) - (hitTime / hits)) * hits / 1000 : 0;

  const usedMB = (bytesUsed / (1024 * 1024)).toFixed(1);
  const maxMB = (bytesMax / (1024 * 1024)).toFixed(1);

  console.log('\n===================================================');
  console.log('📦  Cypress In-Memory Cache Summary');
  console.log('===================================================');
  console.log(`Hit Rate:         ${hitRate}% (${hits} Hits / ${misses} Misses)`);
  console.log(`Avg Key Hit Rate: ${keyHitRate} (${hits} Hits / ${keysCount} Keys)`);
  console.log(`Avg Hit Latency:  ${avgHit}ms`);
  console.log(`Avg Miss Delay:   ${avgMiss}ms (Saved ~${estimatedTimeSaved.toFixed(1)} seconds!)`);
  console.log(`Cache Usage:      ${usedMB} MB / ${maxMB} MB`);
  console.log('===================================================\n');
}

async function installHttpCache(on, config, options = {}) {
  const target = config.baseUrl;
  if (!target) return config;

  const { port, close } = await startProxy({ target, ...options });
  config.baseUrl = `http://localhost:${port}`;
  console.log(`[Cypress HTTP Cache] Started. Traffic routed via Proxy port ${port}.`);

  on('after:run', async () => {
    const stats = await close();
    printCacheSummary(stats);
  });
  
  return config;
}

module.exports = { installHttpCache };
