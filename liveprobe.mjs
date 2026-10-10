import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:9225/devtools/page/1E8B966076049FFC623CB9C107252A23', { perMessageDeflate: false });
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { execSync } = require('child_process');
const fs = require('fs');
let nid = 0; const pending = new Map();
function send(method, params = {}) { return new Promise((res) => { const msg = { id: ++nid, method, params }; pending.set(msg.id, res); ws.send(JSON.stringify(msg)); }); }
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); } });
ws.on('open', async () => {
  await new Promise(r2 => setTimeout(r2, 15000));
  for (let k = 0; k < 20; k++) {
    try {
      const r = await Promise.race([send('Runtime.evaluate', { expression: 'JSON.stringify({m:(performance.memory.usedJSHeapSize/1048576).toFixed(1), p:(document.body.innerText.match(/PAINTS\\/S (\\d+)/)||[])[1]||0})', returnByValue: true }), new Promise(res => setTimeout(() => res(null), 6000))]);
      const v = r && r.result && r.result.value ? r.result.value : 'NO_RESP';
      const rn = execSync("ps ax -o pid,rss,%cpu,command | grep -E 'chrome.*type=renderer' | grep 9225 | grep -v webui | awk '{print \$2, \$3}' | sort -rn | head -1").toString().trim();
      fs.appendFileSync('/tmp/live-probe.log', k + ' ' + v + ' | maxRenderer(kB,cpu): ' + rn + '\n');
    } catch (e) { }
    await new Promise(r2 => setTimeout(r2, 30000));
  }
  process.exit(0);
});
setTimeout(() => process.exit(1), 700000);
