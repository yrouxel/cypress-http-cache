const http = require('http');

const PORT = 3000;
const delayMs = 500;

const server = http.createServer((req, res) => {
  // 1. Simple HTML Document
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <script src="/heavy.js"></script>
        </head>
        <body>
          <h1>Cypress Cache Test</h1>
          <p>This page loads a heavily delayed JS file.</p>
        </body>
      </html>
    `);
  } 
  
  // 2. Heavy Cacheable Asset
  else if (req.url === '/heavy.js') {
    // Artificial heavy delay to simulate slow fetching, slow building, or massive file sizes
    
    setTimeout(() => {
      res.writeHead(200, { 
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600'
      });
      // Small body, but long delivery time
      res.end('console.log("Heavy asset loaded!");');
    }, delayMs);
  } 
  
  else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Test server running directly on http://localhost:${PORT}`);
  console.log(`The proxy should hit this app. /heavy.js takes ${delayMs}ms to respond natively.`);
});
