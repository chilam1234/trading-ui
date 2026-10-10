import WebSocket from 'ws';
import { request } from 'http';
async function getPageId() {
  return new Promise((res, rej) => {
    const req = request({ host: '127.0.0.1', port: 9223, path: '/json', method: 'GET' }, (r) => {
      let b = '';
      r.on('data', (c) => b += c);
      r.on('end', () => {
        const pages = JSON.parse(b).filter(t => t.type === 'page' && t.url.includes('localhost:5173'));
        res(pages[pages.length - 1]?.id);
      });
    });
    req.on('error', rej); req.end();
  });
}
const tid = await getPageId();
const ws = new WebSocket('ws://127.0.0.1:9223/devtools/page/' + tid, { perMessageDeflate: false });
let nid = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((res) => { const msg = { id: ++nid, method, params }; pending.set(msg.id, res); ws.send(JSON.stringify(msg)); });
}
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); } });
ws.on('open', async () => {
  for (let k = 0; k < 9; k++) {
    try {
      const r = await Promise.race([
        send('Runtime.evaluate', { expression: 'JSON.stringify({m:(performance.memory.usedJSHeapSize/1048576).toFixed(1), dt:((Date.now()-performance.timeOrigin)/60000).toFixed(1)})', returnByValue: true }),
        new Promise((res) => setTimeout(() => res({ timeout: true }), 5000)),
      ]);
      console.log(k, r.timeout ? 'NO_RESPONSE(main-thread-busy?)' : r.result?.value);
    } catch (e) { console.log(k, 'ERR', String(e).slice(0, 60)); }
    await new Promise(r2 => setTimeout(r2, 40000));
  }
  process.exit(0);
});
