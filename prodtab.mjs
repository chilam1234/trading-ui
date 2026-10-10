import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:9225/devtools/browser/E4839D90-PLACEHOLDER', { perMessageDeflate: false });
ws.on('error', (e) => console.log('ERR', e.message));
// fallback approach: use /json/new via PUT
import http from 'http';
const req = http.request({ host: '127.0.0.1', port: 9225, path: '/json/new?http://localhost:4173', method: 'PUT' }, (r0) => {
  let b = '';
  r0.on('data', (c) => b += c);
  r0.on('end', () => { console.log('PUT_DONE ' + b.slice(0, 120)); process.exit(0); });
});
req.on('error', (e) => { console.log('ERR ' + e.message); process.exit(1); });
req.end();
setTimeout(() => { console.log('TO'); process.exit(1); }, 8000);
