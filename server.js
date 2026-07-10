// Minimal zero-dependency static file server for the BenSync marketing site.
// Serves the ./public directory and honors Railway's $PORT.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    // Resolve within ROOT and block traversal.
    let filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');

    // Allow extensionless page URLs (e.g. /employers -> /employers.html).
    if (!path.extname(filePath) && !fs.existsSync(filePath)) {
      if (fs.existsSync(filePath + '.html')) filePath += '.html';
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        const notFound = path.join(ROOT, '404.html');
        if (fs.existsSync(notFound)) {
          return fs.readFile(notFound, (e, buf) =>
            e ? send(res, 404, 'Not Found') : send(res, 404, buf, TYPES['.html']));
        }
        return send(res, 404, 'Not Found');
      }
      const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      fs.readFile(filePath, (e, buf) => (e ? send(res, 500, 'Server Error') : send(res, 200, buf, type)));
    });
  } catch (_e) {
    send(res, 500, 'Server Error');
  }
});

server.listen(PORT, () => console.log(`BenSync site listening on :${PORT}`));
