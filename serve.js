// The wallet is static files: client/src can be put on any web server as it is.
// This is a small server for trying it locally, with nothing behind it but the files.
//
// Antelope only accepts WebAuthn signatures made on an https:// origin, so set TLS_KEY and
// TLS_CERT (paths to a key and certificate) to serve over https, even on localhost.

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const root = path.join(__dirname, 'client', 'src');
const port = process.env.PORT || '8000';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.gif': 'image/gif', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
};

const handler = (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  });
};

const tls = process.env.TLS_KEY && process.env.TLS_CERT;
const server = tls
  ? https.createServer({ key: fs.readFileSync(process.env.TLS_KEY), cert: fs.readFileSync(process.env.TLS_CERT) }, handler)
  : http.createServer(handler);
server.listen(port, () => console.log(`Serving the wallet on ${tls ? 'https' : 'http'}://localhost:${port}`));
