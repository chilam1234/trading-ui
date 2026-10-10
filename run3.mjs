import WebSocket from 'ws';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const LOG = '/tmp/run3.log';
function log(s) { fs.appendFileSync(LOG, s + '\n'); }
const ws = new WebSocket('ws://127.0.0.1:9225/devtools/page/537545358D1FC0DB301C403CF26EC076', { perMessageDeflate: false });
let nid = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((res) => { const msg = { id: ++nid, method, params }; pending.set(msg.id, res); ws.send(JSON.stringify(msg)); });
}
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); } });
ws.on('open', async () => {
  await send('Page.enable'); await send('Performance.enable');
  await send('Page.reload');
  await new Promise(r2 => setTimeout(r2, 15000));
  for (let k = 0; k < 60; k++) {
    try {
      const mm = await Promise.race([send('Performance.getMetrics'), new Promise(r2 => setTimeout(() => r2(null), 6000))]);
      const want = ['JSHeapUsedSize','JSHeapTotalSize','Nodes','JSEventListeners','Documents','Frames','LayoutCount','RecalcStyleCount','UsedSize'];
      const vals = {};
      if (mm && mm.metrics) {
        for (const m2 of mm.metrics) if (want.includes(m2.name)) vals[m2.name] = m2.value;
      }
      // native-ish: documents/nodes/listeners growth = DOM leak; also count canvases:
      const ev = await Promise.race([send('Runtime.evaluate', { expression:
        'JSON.stringify({cv:document.querySelectorAll("canvas").length, div:document.querySelectorAll("div").length, tr:document.querySelectorAll("tr").length})', returnByValue: true }),
        new Promise(r2 => setTimeout(() => r2(null), 6000))]);
      const dom = ev && ev.result && ev.result.value ? ev.result.value : '-';
      log(JSON.stringify({k, dom, ...vals}));
    } catch (e) { log('ERR ' + String(e).slice(0,80)); }
    await new Promise(r2 => setTimeout(r2, 15000));
  }
  process.exit(0);
});
setTimeout(() => process.exit(1), 1300000);
