import { startProxy } from './proxy';
import { existsSync, unlinkSync, writeFileSync } from 'fs';

function printUsage() {
  console.error('Usage: node server.js <config_json>');
  console.error('Example: node server.js \'{"target":"http://localhost:3000"}\'');
  console.error('Options:');
  console.error('  target: string (required)          - The target URL to proxy to');
  console.error('  cacheSize: number (optional)       - Maximum cache size in MB');
  console.error('  logStats: boolean (optional)       - Enable cache stats logging');
  console.error('  addCacheHeaders: boolean (optional)- Add X-Cache and Server-Timing headers');
  console.error('  secure: boolean (optional)         - Enable strict SSL validation');
  console.error('  tempFilePath: string (optional)    - Path to write the ready state JSON file');
}

async function run() {
  const args = process.argv[2];
  if (!args || args === '--help' || args === '-h') {
    printUsage();
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(args);
  } catch (e) {
    console.error('[Cypress HTTP Cache Server] Error: Invalid JSON configuration provided.\\n');
    printUsage();
    process.exit(1);
  }

  const { target, cacheSize, logStats, addCacheHeaders, secure, tempFilePath } = config;
  if (!target) {
    console.error('[Cypress HTTP Cache Server] Error: Missing required configuration "target".\\n');
    printUsage();
    process.exit(1);
  }

  try {
    const { port } = await startProxy({
      target,
      cacheSize,
      logStats,
      addCacheHeaders,
      secure,
    });

    const data = {
      url: `http://localhost:${port}`,
      pid: process.pid,
    };

    if (tempFilePath) {
      writeFileSync(tempFilePath, JSON.stringify(data));
    }

    if (process.send) {
      process.send(data);
    }

    console.log(
      `[Cypress HTTP Cache Server] ${target} is now proxied at ${data.url} (PID: ${data.pid})`,
    );
    process.stdin.resume();

    const cleanup = () => {
      if (tempFilePath && existsSync(tempFilePath)) {
        unlinkSync(tempFilePath);
      }
      process.exit();
    };
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  } catch (e) {
    console.error('[Cypress HTTP Cache Server] Failed to start:', e);
    if (process.send) {
      process.send({ error: e instanceof Error ? e.message : String(e) });
    }
    process.exit(1);
  }
}

run();
