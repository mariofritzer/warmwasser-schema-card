// Run: node tests/helpers/visual-compare.cjs [port]
// Open the printed URL. Baseline is read directly from the fixed Git revision;
// the current source is read afresh for each request. Stop with Ctrl-C.
// Visual smoke check only: HA icons are stubbed; this is not a Home Assistant integration test.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hash } = require('./legacy-render.cjs');
const root = path.resolve(__dirname, '../..');
const baseline = execFileSync('git', ['show', '5637cc24a1832652a91a18c24b76e3f71610cb46:warmwasser-schema-card.js'], { cwd: root, encoding: 'utf8' });
if (hash(baseline) !== 'b9d23f368617f4d0d858a43f28a2c80825517c948742a45cbe468c87bc11bfe1') throw Error('Unexpected baseline source hash');
const port = Number(process.argv[2] || 8765);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let body, type;
  if (url.pathname === '/') { body = fs.readFileSync(path.join(__dirname, 'visual-compare.html')); type = 'text/html; charset=utf-8'; }
  else if (url.pathname === '/distributor') { body = fs.readFileSync(path.join(__dirname, 'distributor.html')); type = 'text/html; charset=utf-8'; }
  else if (url.pathname === '/baseline.js') { body = baseline; type = 'text/javascript; charset=utf-8'; }
  else if (url.pathname === '/current.js') { body = fs.readFileSync(path.join(root, 'warmwasser-schema-card.js')); type = 'text/javascript; charset=utf-8'; }
  else { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body);
});
server.listen(port, '127.0.0.1', () => console.log(`Visual comparison: http://127.0.0.1:${port}/`));
