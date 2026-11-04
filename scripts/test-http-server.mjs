import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const probePath = process.argv[2];
if (!probePath) throw Error('Missing browser probe file path');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost/').pathname);
  let filename = path === '/probe.html' ? probePath : path === '/' ? join(root,'index.html') : resolve(root,'.'+path);
  if (!(filename === probePath || filename === join(root,'index.html') ||
      filename.startsWith(root + '/'))) {
    response.writeHead(403).end('Forbidden'); return;
  }
  try {
    const bytes=readFileSync(filename);
    response.writeHead(200, {'Content-Type':mime[extname(filename)] || 'text/plain',
      'Cache-Control':'no-store'}).end(bytes);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.listen(0,'127.0.0.1',()=>{process.stdout.write('PORT:'+server.address().port+'\n')});
process.on('SIGTERM',()=>server.close());
