import WebSocket from 'ws';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { execSync } = require('child_process');
const fs = require('fs');
const LOG = '/tmp/watchdog.log';
function log(s) { fs.appendFileSync(LOG, s + '\n'); }
const ws = new WebSocket('ws://127.0.0.1:9225/devtools/page/537545358D1FC0DB301C403CF26EC076', { perMessageDeflate: false });
let nid = 0; const pending = new Map();
function send(method, params = {}) {
  return new Promise((res) => { const msg = { id: ++nid, method, params }; pending.set(msg.id, res); ws.send(JSON.stringify(msg)); });
}
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); } });
ws.on('open', async () => {
  log('open ' + new Date().toISOString());
  let misses = 0;
  for (let k = 0; k < 240; k++) {
    let ok = false, val = '';
    try {
      const r = await Promise.race([
        send('Runtime.evaluate', { expression: 'JSON.stringify({m:(performance.memory.usedJSHeapSize/1048576).toFixed(0), dt:((Date.now()-performance.timeOrigin)/60000).toFixed(1)})', returnByValue: true }),
        new Promise((res) => setTimeout(() => res(null), 5000)),
      ]);
      if (r && r.result && r.result.value) { ok = true; val = r.result.value; }
    } catch (e) { }
    const rss = execSync(`ps ax -o pid,rss,%cpu,command | grep chrome-visible2 | grep type=renderer | grep -v webui | awk '{print $1, $2, $3}'`).toString().trim();
    log(`k=${k} ok=${ok} v=${val || '-'} rendererRSS_CPU: ${rss}`);
    if (!ok) {
      misses++;
      if (misses === 2) {
        log('FROZE — sampling renderer 8s');
        try {
          const pids = execSync("pgrep -f 'chrome-visible2.*type=renderer' | grep -v $(pgrep -f webui | head -1) || pgrep -f 'chrome-visible2.*type=renderer'").toString().trim().split('\n');
          for (const p of pids.filter(Boolean)) {
            log(`sample pid ${p}`);
            execSync(`sample ${p} 8 -file /tmp/frozen-${p}.txt`, { timeout: 30000 });
          }
          log('sample done');
        } catch (e) { log('sample err ' + e); }
      }
    } else misses = 0;
    await new Promise(r2 => setTimeout(r2, 10000));
  }
  process.exit(0);
});
setTimeout(() => process.exit(1), 2600000);
