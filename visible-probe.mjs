import WebSocket from 'ws';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const ws = new WebSocket('ws://127.0.0.1:9224/devtools/page/736A1339906DD2B4D61A55EAEC61990F', { perMessageDeflate: false });
let nid = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((res) => { const msg = { id: ++nid, method, params }; pending.set(msg.id, res); ws.send(JSON.stringify(msg)); });
}
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); } });
ws.on('open', async () => {
  for (let k = 0; k < 120; k++) {
    try {
      const r = await Promise.race([
        send('Runtime.evaluate', { expression: 'JSON.stringify({m:(performance.memory.usedJSHeapSize/1048576).toFixed(1), tr:(document.body.innerText.match(/TRADES\\s*([\\d,]+)/)||[])[1], dt:((Date.now()-performance.timeOrigin)/60000).toFixed(0)})', returnByValue: true }),
        new Promise((res) => setTimeout(() => res({ timeout: true }), 6000)),
      ]);
      fs.appendFileSync('/tmp/visible-probe.jsonl', JSON.stringify({k, v: r.timeout ? 'NO_RESPONSE' : r.result?.value}) + '\n');
    } catch (e) { }
    await new Promise(r2 => setTimeout(r2, 20000));
  }
  process.exit(0);
});
