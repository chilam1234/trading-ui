import WebSocket from 'ws';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { execSync } = require('child_process');
const fs = require('fs');
const LOG = '/tmp/run3b.log';
function log(s) { fs.appendFileSync(LOG, s + '\n'); }
const ws = new WebSocket('ws://127.0.0.1:9225/devtools/page/AAB33A1A2A9C66DBAC8D35AC0AEAD36C', { perMessageDeflate: false });
let nid = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((res) => { const msg = { id: ++nid, method, params }; pending.set(msg.id, res); ws.send(JSON.stringify(msg)); });
}
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); } });
ws.on('open', async () => {
  log('open');
  await send('Performance.enable');
  await new Promise(r2 => setTimeout(r2, 20000));
  for (let k = 0; k < 100; k++) {
    try {
      const mm = await Promise.race([send('Performance.getMetrics'), new Promise(r2 => setTimeout(() => r2(null), 6000))]);
      const vals = {};
      if (mm && mm.metrics) for (const m2 of mm.metrics)
        if (['JSHeapUsedSize','Nodes','JSEventListeners','Documents','RecalcStyleCount'].includes(m2.name)) vals[m2.name] = Math.round(m2.value);
      const ev = await Promise.race([send('Runtime.evaluate', { expression:
        'JSON.stringify({cv:document.querySelectorAll("canvas").length, ts:performance.now().toFixed(0)})', returnByValue: true }),
        new Promise(r2 => setTimeout(() => r2(null), 6000))]);
      const cv = ev && ev.result && ev.result.value ? ev.result.value : 'NO_RESP';
      log(JSON.stringify(Object.assign({k: k, cv: cv}, vals)));
    } catch (e) { log('ERR ' + String(e).slice(0,60)); }
    const rss = execSync("ps ax -o pid,rss,%cpu,command | grep chrome-visible2 | grep 'type=renderer' | grep -v webui | grep -v grep | awk '{print \$1, \$2, \$3}'").toString();
    log('REN ' + rss.trim().replace(/\n/g, ' | '));
    await new Promise(r2 => setTimeout(r2, 15000));
  }
  process.exit(0);
});
setTimeout(() => process.exit(1), 1600000);
